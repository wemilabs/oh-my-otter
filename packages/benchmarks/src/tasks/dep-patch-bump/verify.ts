import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { isLockfile, lockfileNames } from "../../lib/files";
import {
  changedScripts,
  checkScript,
  scriptChangeReason,
} from "../../lib/scripts";
import { defineTask } from "../../task";
import { TaskPreconditionError, type RepoContext } from "../../types";
import manifest from "./task.json";
import prompt from "./prompt.md";

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
] as const;

const dataSchema = z.object({
  declarations: z.record(z.string(), z.string()),
  pnp: z.boolean().optional(),
});
type Data = z.infer<typeof dataSchema>;

type DependencyMap = Record<string, string>;

function dependencies(json: unknown): DependencyMap {
  const result: DependencyMap = {};
  if (json === null || typeof json !== "object") return result;
  for (const field of dependencyFields) {
    const value = (json as Record<string, unknown>)[field];
    if (value === null || typeof value !== "object") continue;
    for (const [name, spec] of Object.entries(value)) {
      if (typeof spec === "string") result[`${field}:${name}`] = spec;
    }
  }
  return result;
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function specFor(deps: DependencyMap, pkg: string): string | undefined {
  for (const field of dependencyFields) {
    const spec = deps[`${field}:${pkg}`];
    if (spec !== undefined) return spec;
  }
  return undefined;
}

/** The compatibility line of a range: `1` for 1.x, `0.4` for 0.4.x. */
export function compatibilityLine(spec: string): string | null {
  const match = /(\d+)(?:\.(\d+|x|\*))?/.exec(spec.replace(/^npm:[^@]+@/, ""));
  if (!match) return null;
  const major = match[1] as string;
  if (major !== "0") return major;
  const minor = match[2];
  return minor === undefined || minor === "x" || minor === "*"
    ? "0"
    : `0.${minor}`;
}

function npmLockPackages(json: unknown): Record<string, unknown> {
  if (json === null || typeof json !== "object") return {};
  const packages = (json as { packages?: unknown }).packages;
  return packages !== null && typeof packages === "object"
    ? (packages as Record<string, unknown>)
    : {};
}

function npmLockVersions(json: unknown, pkg: string): string {
  const versions: string[] = [];
  for (const [key, value] of Object.entries(npmLockPackages(json))) {
    if (key !== `node_modules/${pkg}` && !key.endsWith(`/node_modules/${pkg}`))
      continue;
    const version = (value as { version?: unknown } | null)?.version;
    versions.push(`${key}@${typeof version === "string" ? version : ""}`);
  }
  return versions.sort().join(",");
}

/** Every resolved version of `pkg` in an npm lockfile's `packages` map. */
function npmLockVersionList(json: unknown, pkg: string): string[] {
  const versions = new Set<string>();
  for (const [key, value] of Object.entries(npmLockPackages(json))) {
    if (key !== `node_modules/${pkg}` && !key.endsWith(`/node_modules/${pkg}`))
      continue;
    const version = (value as { version?: unknown } | null)?.version;
    if (typeof version === "string" && version !== "") versions.add(version);
  }
  return [...versions].sort();
}

/** The directory part of a repo-relative path; "" for files at the root. */
function dirOf(file: string): string {
  const index = file.lastIndexOf("/");
  return index === -1 ? "" : file.slice(0, index);
}

const npmLockPattern = /(?:^|\/)(?:package-lock|npm-shrinkwrap)\.json$/;

/**
 * The lockfile that governs `dir`: the nearest existing one walking up to the
 * repo root. When one directory has several, a changed one wins.
 */
async function findLockfile(
  ctx: RepoContext,
  dir: string,
  changed: ReadonlySet<string>,
): Promise<string | null> {
  let current = dir;
  while (true) {
    let fallback: string | null = null;
    for (const name of lockfileNames) {
      const file = current === "" ? name : `${current}/${name}`;
      if (!(await ctx.exists(file))) continue;
      if (changed.has(file)) return file;
      fallback ??= file;
    }
    if (fallback !== null) return fallback;
    if (current === "") return null;
    current = dirOf(current);
  }
}

/**
 * Resolves `pkg` like Node: from `dir` upward to the repo root, the first
 * `node_modules/<pkg>/package.json` wins. Reads through pnpm symlinks.
 */
async function installedPackage(
  root: string,
  dir: string,
  pkg: string,
): Promise<{ path: string; version: string } | null> {
  let current = dir;
  while (true) {
    const pkgDir =
      current === "" ? `node_modules/${pkg}` : `${current}/node_modules/${pkg}`;
    try {
      const text = await readFile(
        path.join(root, pkgDir, "package.json"),
        "utf8",
      );
      const version = (JSON.parse(text) as { version?: unknown }).version;
      return {
        path: pkgDir,
        version: typeof version === "string" ? version : "unknown",
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        return { path: pkgDir, version: "unknown" };
      }
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
    }
    if (current === "") return null;
    current = dirOf(current);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Resolved versions of `pkg` in a pnpm, yarn, or bun text lockfile. */
export function lockfileVersions(text: string | null, pkg: string): string[] {
  if (text === null) return [];
  const name = escapeRegExp(pkg);
  const versions = new Set<string>();
  const inline = new RegExp(
    `(?<![\\w.@-]|[\\w.-]/)${name}[@/](?:npm:)?v?(\\d+\\.\\d+\\.\\d+[\\w.+-]*)`,
    "g",
  );
  for (const match of text.matchAll(inline)) versions.add(match[1] as string);
  const header = new RegExp(`(?:^|[\\s",])"?${name}@`);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!/^\S/.test(line) || !header.test(line)) return;
    for (let next = index + 1; next < lines.length; next += 1) {
      const entry = lines[next] as string;
      if (!/^\s/.test(entry)) break;
      const version = /^\s+version:?\s+"?([^"\s]+)"?/.exec(entry);
      if (version) {
        versions.add(version[1] as string);
        break;
      }
    }
  });
  return [...versions].sort();
}

function changedDependencyNames(
  before: DependencyMap,
  after: DependencyMap,
  pkg: string,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter((key) => !key.endsWith(`:${pkg}`) && before[key] !== after[key])
    .map((key) => key.split(":").slice(1).join(":"));
}

async function manifestFiles(ctx: RepoContext): Promise<string[]> {
  const files = await ctx.glob("**/package.json");
  return files.filter((file) => !file.split("/").includes("node_modules"));
}

export default defineTask<Data>({
  manifest,
  prompt,
  scripts: ["build", "test"],
  async prepare(ctx) {
    const pkg = ctx.params.package as string;
    const declarations: Record<string, string> = {};
    for (const file of await manifestFiles(ctx)) {
      const spec = specFor(dependencies(parseJson(await ctx.read(file))), pkg);
      if (spec !== undefined) declarations[file] = spec;
    }
    if (Object.keys(declarations).length === 0) {
      throw new TaskPreconditionError(
        `${pkg} is not declared in any package.json dependencies.`,
      );
    }
    let hasLockfile = false;
    for (const file of await ctx.glob("**/*")) {
      if (isLockfile(file)) hasLockfile = true;
    }
    if (!hasLockfile) {
      throw new TaskPreconditionError("No lockfile found in the repository.");
    }
    const pnp = (await ctx.exists(".pnp.cjs")) || (await ctx.exists(".pnp.js"));
    return { declarations, pnp };
  },
  async verify(ctx) {
    const pkg = ctx.params.package as string;
    const data = dataSchema.parse(ctx.baseline.data);
    const reasons: string[] = [];
    let failed = false;
    let partial = false;

    const changed = await ctx.changedFiles();
    const lockfiles = changed.filter(
      (file) => isLockfile(file.path) && file.status !== "deleted",
    );
    let lockfileUpdated = false;
    for (const file of lockfiles) {
      if (file.path.endsWith(".lockb")) {
        lockfileUpdated = true;
        continue;
      }
      if (npmLockPattern.test(file.path)) {
        const before = npmLockVersions(
          parseJson(await ctx.readBaseline(file.path)),
          pkg,
        );
        const after = npmLockVersions(
          parseJson(await ctx.read(file.path)),
          pkg,
        );
        if (after !== before) lockfileUpdated = true;
        continue;
      }
      const before = lockfileVersions(await ctx.readBaseline(file.path), pkg);
      const after = lockfileVersions(await ctx.read(file.path), pkg);
      if (after.length > 0 && before.join(",") !== after.join(",")) {
        lockfileUpdated = true;
      }
    }
    if (lockfileUpdated) {
      reasons.push(`Lockfile updated for ${pkg}.`);
    } else {
      failed = true;
      reasons.push(`No lockfile change mentions ${pkg}.`);
    }

    for (const [file, before] of Object.entries(data.declarations)) {
      const beforeDeps = dependencies(parseJson(await ctx.readBaseline(file)));
      const afterDeps = dependencies(parseJson(await ctx.read(file)));
      const after = specFor(afterDeps, pkg);
      if (after === undefined) {
        failed = true;
        reasons.push(`${pkg} was removed from ${file}.`);
        continue;
      }
      const beforeLine = compatibilityLine(before);
      const afterLine = compatibilityLine(after);
      if (
        beforeLine !== null &&
        afterLine !== null &&
        beforeLine !== afterLine
      ) {
        failed = true;
        reasons.push(
          `${pkg} moved to a new major version in ${file} (${before} → ${after}).`,
        );
      } else if (before !== after) {
        reasons.push(`${file}: ${pkg} ${before} → ${after}.`);
      }
      const changedOthers = changedDependencyNames(beforeDeps, afterDeps, pkg);
      if (changedOthers.length > 0) {
        partial = true;
        reasons.push(
          `Other dependencies changed in ${file}: ${changedOthers.join(", ")}.`,
        );
      }
    }
    for (const file of changed) {
      if (!/(?:^|\/)package\.json$/.test(file.path)) continue;
      if (file.path in data.declarations) continue;
      const changedOthers = changedDependencyNames(
        dependencies(parseJson(await ctx.readBaseline(file.path))),
        dependencies(parseJson(await ctx.read(file.path))),
        pkg,
      );
      if (changedOthers.length > 0) {
        partial = true;
        reasons.push(
          `Other dependencies changed in ${file.path}: ${changedOthers.join(", ")}.`,
        );
      }
    }
    const scripts = await changedScripts(ctx, ["build", "test"]);
    if (scripts.length > 0) {
      partial = true;
      reasons.push(scriptChangeReason(scripts));
    }

    // The bump only counts when the new version was actually installed;
    // verify never runs an install itself.
    if (lockfileUpdated) {
      const installReasons = new Set<string>();
      // Recorded at start, so a Plug'n'Play file added later can't skip this.
      const pnp = data.pnp === true;
      if (pnp) {
        installReasons.add(
          `Yarn Plug'n'Play install; installed ${pkg} version not checked.`,
        );
      }
      const changedLocks = new Set(lockfiles.map((file) => file.path));
      for (const [file, declaredSpec] of Object.entries(data.declarations)) {
        if (pnp) break;
        const dir = dirOf(file);
        const specChanged =
          specFor(dependencies(parseJson(await ctx.read(file))), pkg) !==
          declaredSpec;
        const lock = await findLockfile(ctx, dir, changedLocks);
        if (lock !== null && !changedLocks.has(lock)) {
          // The declaring package's own lockfile was not updated.
          if (!specChanged) continue;
          partial = true;
          installReasons.add(
            `${file} bumps ${pkg} but its lockfile ${lock} was not updated; the bump was never installed (a clean install may reject it).`,
          );
          continue;
        }
        let expected: string[] | null = null;
        if (lock !== null && npmLockPattern.test(lock)) {
          const json = parseJson(await ctx.read(lock));
          const packages = npmLockPackages(json);
          // Node-style: the first lockfile entry from the declaring dir up to
          // the lockfile's dir wins, mirroring how the install resolves.
          let rel = path.posix.relative(dirOf(lock) || ".", dir || ".");
          let locked: string | undefined;
          while (true) {
            const key =
              rel === "" ? `node_modules/${pkg}` : `${rel}/node_modules/${pkg}`;
            const version = (packages[key] as { version?: unknown } | undefined)
              ?.version;
            if (typeof version === "string" && version !== "") {
              locked = version;
              break;
            }
            if (rel === "") break;
            rel = dirOf(rel);
          }
          expected =
            locked === undefined ? npmLockVersionList(json, pkg) : [locked];
        } else if (lock !== null && !lock.endsWith(".lockb")) {
          const before = lockfileVersions(await ctx.readBaseline(lock), pkg);
          const after = lockfileVersions(await ctx.read(lock), pkg);
          const added = after.filter((version) => !before.includes(version));
          // The newly added version only applies to workspaces whose spec
          // changed; untouched ones keep the full locked list.
          expected = specChanged && added.length > 0 ? added : after;
        }
        if (expected === null || expected.length === 0) {
          installReasons.add(
            `Could not read the bumped ${pkg} version from the lockfile; installed version not checked.`,
          );
          continue;
        }
        const installed = await installedPackage(ctx.root, dir, pkg);
        if (installed === null) {
          partial = true;
          installReasons.add(
            `${pkg} is not installed in node_modules (resolved from ${dir === "" ? "the repo root" : dir}); the bump was never installed (a clean install may reject it).`,
          );
        } else if (expected.includes(installed.version)) {
          installReasons.add(
            `Installed ${pkg} ${installed.version} matches the lockfile.`,
          );
        } else {
          partial = true;
          installReasons.add(
            `node_modules has ${pkg} ${installed.version} but the lockfile says ${expected.join(" or ")}; the bump was never installed (a clean install may reject it).`,
          );
        }
      }
      reasons.push(...installReasons);
    }

    for (const script of ["build", "test"]) {
      const check = await checkScript(ctx, script);
      if (check.counted) partial = true;
      reasons.push(check.reason);
    }

    return {
      outcome: failed ? "fail" : partial ? "partial" : "pass",
      reasons,
    };
  },
});
