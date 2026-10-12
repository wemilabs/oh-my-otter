import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runFileSchema, type RunFile } from "../schema";
import { OMOT_DIR } from "./gitignore";

export const RUN_FILE = `${OMOT_DIR}/run.json`;

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
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "run"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid ${RUN_FILE}: ${issues}`);
  }
  return parsed.data;
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
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
