import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  migrateRunFile,
  runFileSchema,
  type RunFile,
  type Verification,
} from "../schema";
import { OMOT_DIR } from "./gitignore";

export const RUN_FILE = `${OMOT_DIR}/run.json`;
const RUN_FILE_LOCK = `${RUN_FILE}.lock`;
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 60_000;

async function assertNotSymlink(file: string, label: string): Promise<boolean> {
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink()) {
      throw new Error(`${label} is a symbolic link; refusing to use it.`);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function readRunFile(root: string): Promise<RunFile> {
  const file = path.join(root, OMOT_DIR, "run.json");
  await assertNotSymlink(path.join(root, OMOT_DIR), OMOT_DIR);
  let contents: string;
  try {
    contents = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `No benchmark run found at ${RUN_FILE}; start one with "omot bench start <id>".`,
        { cause: error },
      );
    }
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new Error(`${RUN_FILE} is not valid JSON.`, { cause: error });
  }
  const parsed = runFileSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const migrated = migrateRunFile(value);
  if (migrated) return migrated;
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "run"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid ${RUN_FILE}: ${issues}`);
}

export function appendVerification(run: RunFile, entry: Verification): RunFile {
  const verifications = [...run.verifications, entry];
  return runFileSchema.parse({
    ...run,
    verifications,
    result: {
      outcome: entry.outcome,
      reasons: entry.reasons,
      verified_at: entry.verified_at,
      human_corrections: entry.human_corrections,
      human_minutes: entry.human_minutes,
      attempts: verifications.length,
    },
  });
}

export async function writeRunFile(root: string, run: RunFile): Promise<void> {
  const directory = path.join(root, OMOT_DIR);
  const exists = await assertNotSymlink(directory, OMOT_DIR);
  if (!exists) await mkdir(directory);
  else if (!(await lstat(directory)).isDirectory()) {
    throw new Error(`${OMOT_DIR} exists and is not a directory.`);
  }
  const file = path.join(directory, "run.json");
  await assertNotSymlink(file, RUN_FILE);
  const value = runFileSchema.parse(run);
  const temporary = path.join(directory, `run.json.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function acquireRunFileLock(root: string): Promise<() => Promise<void>> {
  const directory = path.join(root, OMOT_DIR);
  const directoryExists = await assertNotSymlink(directory, OMOT_DIR);
  if (!directoryExists) await mkdir(directory);
  else if (!(await lstat(directory)).isDirectory()) {
    throw new Error(`${OMOT_DIR} exists and is not a directory.`);
  }
  const file = path.join(root, RUN_FILE_LOCK);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (true) {
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(file, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const info = await lstat(file);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
          await unlink(file).catch((unlinkError) => {
            if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") {
              throw unlinkError;
            }
          });
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for ${RUN_FILE_LOCK}.`, {
          cause: error,
        });
      }
      await delay(LOCK_RETRY_MS);
      continue;
    }

    const token = randomUUID();
    try {
      await handle.writeFile(token);
    } catch (error) {
      try {
        await handle.close();
      } catch {
        // The lock file is still removed below.
      }
      await unlink(file).catch(() => {});
      throw error;
    }
    return async () => {
      let releaseError: unknown;
      try {
        await handle.close();
      } catch (error) {
        releaseError = error;
      }
      try {
        if ((await readFile(file, "utf8")) === token) await unlink(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          releaseError ??= error;
        }
      }
      if (releaseError) throw releaseError;
    };
  }
}

export async function removeRunFile(root: string): Promise<void> {
  const release = await acquireRunFileLock(root);
  try {
    await unlink(path.join(root, RUN_FILE)).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  } finally {
    await release();
  }
}

export async function replaceRunFile(
  root: string,
  run: RunFile,
): Promise<void> {
  const release = await acquireRunFileLock(root);
  try {
    await writeRunFile(root, run);
  } finally {
    await release();
  }
}

export async function updateRunFile(
  root: string,
  update: (run: RunFile) => RunFile,
): Promise<RunFile> {
  const release = await acquireRunFileLock(root);
  try {
    const run = await readRunFile(root);
    const updated = runFileSchema.parse(update(run));
    await writeRunFile(root, updated);
    return updated;
  } finally {
    await release();
  }
}
