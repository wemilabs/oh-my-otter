import { z } from "zod";
import { commandFailure } from "../../context";
import { isLockfile } from "../../lib/files";
import { changedScripts, scriptChangeReason } from "../../lib/scripts";
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

function npmLockVersions(json: unknown, pkg: string): string {
  if (json === null || typeof json !== "object") return "";
  const packages = (json as { packages?: unknown }).packages;
  if (packages === null || typeof packages !== "object") return "";
  const versions: string[] = [];
  for (const [key, value] of Object.entries(packages)) {
    if (key !== `node_modules/${pkg}` && !key.endsWith(`/node_modules/${pkg}`))
      continue;
    const version = (value as { version?: unknown } | null)?.version;
    versions.push(`${key}@${typeof version === "string" ? version : ""}`);
  }
  return versions.sort().join(",");
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
    return { declarations };
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
      if (/(?:^|\/)(?:package-lock|npm-shrinkwrap)\.json$/.test(file.path)) {
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

    for (const script of ["build", "test"]) {
      const result = await ctx.runScript(script);
      if (result === null) {
        reasons.push(`No ${script} script; skipped.`);
      } else if (result.code === 0) {
        reasons.push(`${script} script passed.`);
      } else {
        partial = true;
        reasons.push(commandFailure(`${script} script`, result));
      }
    }

    return {
      outcome: failed ? "fail" : partial ? "partial" : "pass",
      reasons,
    };
  },
});
