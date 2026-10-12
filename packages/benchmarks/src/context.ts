import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { createCheckContext } from "@oh-my-otter/core/node";
import { OMOT_DIR, withoutOmotLines } from "./lib/gitignore";
import { normalizeNewlines } from "./lib/files";
import { detectPackageManager } from "./lib/package-manager";
import type {
  ChangedFile,
  CommandResult,
  PackageManager,
  PrepareContext,
  RepoContext,
  VerifyContext,
} from "./types";

export interface ContextOptions {
  params?: Record<string, string>;
  log?: (text: string) => void;
  timeoutMs?: number;
}

export interface PrepareContextOptions extends ContextOptions {
  scripts?: readonly string[];
  skipBaselineScripts?: boolean;
  yes?: boolean;
  isTTY?: boolean;
  confirm?: (question: string) => Promise<boolean>;
}

const DEFAULT_TIMEOUT_MS = 15 * 60_000;

const commandEnv = {
  CI: "true",
  FORCE_COLOR: "0",
  NO_UPDATE_NOTIFIER: "1",
  npm_config_update_notifier: "false",
};

export async function runGit(
  root: string,
  args: readonly string[],
): Promise<string> {
  const result = await execa("git", ["-c", "core.quotepath=false", ...args], {
    cwd: root,
    reject: false,
    stdin: "ignore",
    stripFinalNewline: false,
    env: { GIT_OPTIONAL_LOCKS: "0" },
  });
  if (result.exitCode !== 0) {
    const detail = String(result.stderr || result.stdout).trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return String(result.stdout);
}

/** Resolves the git work-tree root that contains `target`. */
export async function resolveRepoRoot(target: string): Promise<string> {
  let info;
  try {
    info = await stat(target);
  } catch {
    throw new Error(`Path does not exist: ${target}`);
  }
  if (!info.isDirectory())
    throw new Error(`Path is not a directory: ${target}`);
  let topLevel: string;
  try {
    topLevel = (await runGit(target, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    throw new Error(
      `Not a git repository: ${target}. omot bench needs git to record a baseline.`,
    );
  }
  return realpath(path.resolve(topLevel));
}

export async function headCommit(root: string): Promise<string> {
  try {
    return (await runGit(root, ["rev-parse", "HEAD"])).trim();
  } catch {
    throw new Error("The repository has no commits yet; commit first.");
  }
}

async function findPackageBin(
  root: string,
  pkg: string,
  bin?: string,
): Promise<string | null> {
  let directory = root;
  while (true) {
    const manifestPath = path.join(
      directory,
      "node_modules",
      pkg,
      "package.json",
    );
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        bin?: string | Record<string, string>;
      };
      const name = bin ?? pkg.split("/").at(-1) ?? pkg;
      const relative =
        typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[name];
      if (relative) return path.resolve(path.dirname(manifestPath), relative);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
    }
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

export function createRepoContext(
  root: string,
  options: ContextOptions = {},
): RepoContext {
  const base = createCheckContext(root);
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let manager: Promise<PackageManager> | undefined;
  const run = async (
    file: string,
    args: readonly string[],
  ): Promise<CommandResult> => {
    try {
      const result = await execa(file, args, {
        all: true,
        cwd: root,
        reject: false,
        stdin: "ignore",
        timeout,
        env: commandEnv,
        maxBuffer: 256 * 1024 * 1024,
      });
      return {
        code: result.exitCode ?? 1,
        stdout: String(result.stdout ?? ""),
        stderr: String(result.stderr ?? ""),
        output: String(result.all ?? ""),
        timedOut: Boolean(result.timedOut),
      };
    } catch (error) {
      const result = error as {
        exitCode?: number | null;
        stdout?: unknown;
        stderr?: unknown;
        all?: unknown;
        timedOut?: boolean;
      };
      const stdout = String(result.stdout ?? "");
      const stderr = String(result.stderr ?? "");
      return {
        code: result.exitCode ?? 1,
        stdout,
        stderr,
        output: String(
          result.all ?? [stdout, stderr].filter(Boolean).join("\n"),
        ),
        timedOut: Boolean(result.timedOut),
      };
    }
  };
  const scripts = (): Record<string, unknown> => {
    const value = base.packageJson?.scripts;
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  };
  const context: RepoContext = {
    root,
    params: options.params ?? {},
    exists: (file) => base.exists(file),
    read: (file) => base.read(file),
    glob: (pattern) => base.glob(pattern),
    get packageJson() {
      return base.packageJson;
    },
    git: (args) => runGit(root, args),
    packageManager() {
      manager ??= detectPackageManager(base.packageJson, (file) =>
        base.exists(file),
      );
      return manager;
    },
    hasScript(name) {
      const script = scripts()[name];
      return typeof script === "string" && script.trim().length > 0;
    },
    async runScript(name) {
      if (!context.hasScript(name)) return null;
      const pm = await context.packageManager();
      return run(pm, ["run", name]);
    },
    async runPackageBin(pkg, args, bin) {
      const binPath = await findPackageBin(root, pkg, bin);
      if (!binPath) return null;
      return run(process.execPath, [binPath, ...args]);
    },
    log: options.log ?? (() => {}),
  };
  return context;
}

export function createPrepareContext(
  root: string,
  options: PrepareContextOptions = {},
): PrepareContext {
  const repo = createRepoContext(root, options);
  let baseline: Promise<Record<string, CommandResult> | null> | undefined;
  return Object.assign(repo, {
    yes: Boolean(options.yes),
    isTTY: Boolean(options.isTTY),
    confirm: options.confirm ?? (async () => false),
    recordBaseline() {
      baseline ??= (async () => {
        if (options.skipBaselineScripts) return null;
        const results: Record<string, CommandResult> = {};
        for (const name of options.scripts ?? []) {
          if (!repo.hasScript(name)) continue;
          repo.log(`Running ${name} at the baseline...`);
          const result = await repo.runScript(name);
          if (result !== null) results[name] = result;
        }
        return results;
      })();
      return baseline;
    },
  });
}

function parseNul(output: string): string[] {
  return output.split("\0").filter((entry) => entry.length > 0);
}

export function createVerifyContext<TData = unknown>(
  root: string,
  baseline: {
    commit: string;
    data: TData;
    scripts?: Record<string, number>;
  },
  options: ContextOptions = {},
): VerifyContext<TData> {
  const repo = createRepoContext(root, options);
  const readBaseline = async (file: string): Promise<string | null> => {
    const result = await execa(
      "git",
      ["show", `${baseline.commit}:${file.replace(/\\/g, "/")}`],
      { cwd: root, reject: false, stdin: "ignore", stripFinalNewline: false },
    );
    return result.exitCode === 0 ? String(result.stdout) : null;
  };
  return Object.assign(repo, {
    baseline,
    readBaseline,
    async baselineFiles() {
      return parseNul(
        await runGit(root, [
          "ls-tree",
          "-r",
          "--name-only",
          "-z",
          baseline.commit,
        ]),
      );
    },
    async changedFiles() {
      const changes = new Map<string, ChangedFile["status"]>();
      const diff = parseNul(
        await runGit(root, [
          "diff",
          "--name-status",
          "--no-renames",
          "-z",
          baseline.commit,
          "--",
        ]),
      );
      for (let index = 0; index + 1 < diff.length; index += 2) {
        const status = diff[index] as string;
        const file = diff[index + 1] as string;
        changes.set(
          file,
          status.startsWith("A")
            ? "added"
            : status.startsWith("D")
              ? "deleted"
              : "modified",
        );
      }
      const untracked = parseNul(
        await runGit(root, [
          "ls-files",
          "--others",
          "--exclude-standard",
          "-z",
        ]),
      );
      for (const file of untracked) changes.set(file, "added");

      const result: ChangedFile[] = [];
      for (const [file, status] of changes) {
        if (file === OMOT_DIR || file.startsWith(`${OMOT_DIR}/`)) continue;
        if (file === ".gitignore" && status !== "deleted") {
          const current = await repo.read(".gitignore");
          const before =
            status === "added" ? "" : await readBaseline(".gitignore");
          if (
            current !== null &&
            before !== null &&
            withoutOmotLines(current) === withoutOmotLines(before)
          ) {
            continue;
          }
        }
        result.push({ status, path: file });
      }
      return result.sort((left, right) => left.path.localeCompare(right.path));
    },
  });
}

export async function readText(
  ctx: RepoContext,
  file: string,
): Promise<string | null> {
  const contents = await ctx.read(file);
  return contents === null ? null : normalizeNewlines(contents);
}

export function commandFailure(label: string, result: CommandResult): string {
  if (result.timedOut) return `${label} timed out.`;
  return `${label} failed (exit ${result.code}).`;
}

/** Resolves `file` inside `root`, refusing paths (or symlinks) that escape it. */
export async function resolveInside(
  root: string,
  file: string,
): Promise<string> {
  const realRoot = await realpath(root);
  const target = path.resolve(realRoot, file);
  let resolved: string;
  try {
    resolved = await realpath(target);
  } catch {
    resolved = path.join(
      await realpath(path.dirname(target)),
      path.basename(target),
    );
  }
  const relative = path.relative(realRoot, resolved);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Path escapes the repository: ${file}`);
  }
  return resolved;
}
