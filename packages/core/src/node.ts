import { access, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { execa } from "execa";
import fastGlob from "fast-glob";
import type { CheckContext, FixPlan } from "./types";
import { RunDisabledError } from "./runner";

function resolveInside(root: string, relativePath: string): string {
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }
  return absolute;
}

function isInsideRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function assertTargetInsideRoot(
  realRoot: string,
  target: string,
  relativePath: string,
): Promise<void> {
  let ancestor = path.dirname(target);
  while (true) {
    try {
      const realAncestor = await realpath(ancestor);
      if (!isInsideRoot(realRoot, realAncestor)) {
        throw new Error(`Path escapes repository root: ${relativePath}`);
      }
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function createCheckContext(
  root: string,
  opts: { allowRun?: boolean; defaultTimeoutMs?: number } = {},
): CheckContext {
  const absoluteRoot = path.resolve(root);
  let packageJsonLoaded = false;
  let packageJson: Record<string, unknown> | null = null;
  let realRoot: string | undefined;
  const getRealRoot = () => {
    if (realRoot === undefined) realRoot = realpathSync.native(absoluteRoot);
    return realRoot;
  };
  const resolveRealPathInsideRoot = async (relativePath: string) => {
    const target = resolveInside(absoluteRoot, relativePath);
    const rootRealPath = getRealRoot();
    const targetRealPath = await realpath(target);
    return isInsideRoot(rootRealPath, targetRealPath) ? targetRealPath : null;
  };

  const context: CheckContext = {
    root: absoluteRoot,
    async exists(relativePath) {
      try {
        return (await resolveRealPathInsideRoot(relativePath)) !== null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        if ((error as NodeJS.ErrnoException).code === "ENOTDIR") return false;
        if ((error as NodeJS.ErrnoException).code === "ELOOP") return false;
        throw error;
      }
    },
    async read(relativePath) {
      try {
        const target = await resolveRealPathInsideRoot(relativePath);
        if (target === null) return null;
        return await readFile(target, "utf8");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (
          code === "ENOENT" ||
          code === "EISDIR" ||
          code === "ENOTDIR" ||
          code === "ELOOP"
        )
          return null;
        throw error;
      }
    },
    async glob(pattern) {
      if (
        path.isAbsolute(pattern) ||
        /^[A-Za-z]:[\\/]/.test(pattern) ||
        pattern.startsWith("\\\\") ||
        pattern.replace(/\\/g, "/").split("/").includes("..")
      ) {
        throw new Error(`Path escapes repository root: ${pattern}`);
      }
      return (
        await fastGlob(pattern, {
          cwd: absoluteRoot,
          dot: true,
          onlyFiles: true,
          followSymbolicLinks: false,
          ignore: ["**/node_modules/**", "**/.git/**"],
        })
      )
        .map((file) => file.split(path.sep).join("/"))
        .sort();
    },
    get packageJson() {
      if (!packageJsonLoaded) {
        packageJsonLoaded = true;
        try {
          const target = resolveInside(absoluteRoot, "package.json");
          const targetRealPath = realpathSync.native(target);
          if (!isInsideRoot(getRealRoot(), targetRealPath)) {
            packageJson = null;
            return packageJson;
          }
          const contents = readFileSync(targetRealPath, "utf8");
          const parsed: unknown = JSON.parse(contents);
          packageJson =
            parsed !== null &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
              ? deepFreeze(parsed as Record<string, unknown>)
              : null;
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code !== "ENOENT" &&
            (error as NodeJS.ErrnoException).code !== "EISDIR" &&
            (error as NodeJS.ErrnoException).code !== "ENOTDIR" &&
            (error as NodeJS.ErrnoException).code !== "ELOOP" &&
            !(error instanceof SyntaxError)
          ) {
            throw error;
          }
          packageJson = null;
        }
      }
      return packageJson;
    },
    async run(cmd, runOptions) {
      if (!opts.allowRun) throw new RunDisabledError();
      const result = await execa(cmd, {
        shell: true,
        cwd: absoluteRoot,
        reject: false,
        timeout: runOptions?.timeoutMs ?? opts.defaultTimeoutMs ?? 300_000,
        stdout: "pipe",
        stderr: "pipe",
      });
      return { code: result.exitCode ?? 1 };
    },
  };

  return context;
}

export async function planFixes(
  root: string,
  files: FixPlan,
): Promise<{ created: string[]; skipped: string[] }> {
  const absoluteRoot = path.resolve(root);
  const realRoot = await realpath(absoluteRoot);
  const created: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const target = resolveInside(absoluteRoot, file.path);
    await assertTargetInsideRoot(realRoot, target, file.path);
    try {
      await access(target);
      skipped.push(file.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        created.push(file.path);
      } else {
        throw error;
      }
    }
  }
  return { created, skipped };
}

export async function applyFixPlan(
  root: string,
  files: FixPlan,
): Promise<{ created: string[]; skipped: string[] }> {
  const absoluteRoot = path.resolve(root);
  const realRoot = await realpath(absoluteRoot);
  const created: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const target = resolveInside(absoluteRoot, file.path);
    await assertTargetInsideRoot(realRoot, target, file.path);
    try {
      await mkdir(path.dirname(target), { recursive: true });
      await assertTargetInsideRoot(realRoot, target, file.path);
      await writeFile(target, file.contents, { flag: "wx" });
      created.push(file.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        skipped.push(file.path);
      } else {
        throw error;
      }
    }
  }
  return { created, skipped };
}
