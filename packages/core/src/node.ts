import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
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

  const context: CheckContext = {
    root: absoluteRoot,
    async exists(relativePath) {
      try {
        await access(resolveInside(absoluteRoot, relativePath));
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        if ((error as NodeJS.ErrnoException).code === "ENOTDIR") return false;
        throw error;
      }
    },
    async read(relativePath) {
      try {
        return await readFile(
          resolveInside(absoluteRoot, relativePath),
          "utf8",
        );
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "EISDIR") return null;
        throw error;
      }
    },
    async glob(pattern) {
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
          const contents = readFileSync(
            resolveInside(absoluteRoot, "package.json"),
            "utf8",
          );
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
  const created: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const target = resolveInside(absoluteRoot, file.path);
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
  const created: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const target = resolveInside(absoluteRoot, file.path);
    try {
      await mkdir(path.dirname(target), { recursive: true });
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
