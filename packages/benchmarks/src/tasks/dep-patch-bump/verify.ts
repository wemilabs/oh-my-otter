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

async function isShadowedPackageLock(
  ctx: RepoContext,
  file: string,
): Promise<boolean> {
  if (file !== "package-lock.json" && !file.endsWith("/package-lock.json")) {
    return false;
  }
  const dir = dirOf(file);
  const shrinkwrap =
    dir === "" ? "npm-shrinkwrap.json" : `${dir}/npm-shrinkwrap.json`;
  return ctx.exists(shrinkwrap);
}

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
      if (await isShadowedPackageLock(ctx, file)) continue;
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

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
];

const semverStart = /^\d+\.\d+\.\d+/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function unquote(value: string): string {
  const text = value.trim();
  return text.length > 1 &&
    ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'")))
    ? text.slice(1, -1)
    : text;
}

/** The unquoted `key:` / `key: value` pair of a YAML-style line, or null. */
function yamlKeyValue(line: string): { key: string; value: string } | null {
  const match =
    /^\s*(?:"([^"]*)"|'([^']*)'|([^:'"][^:]*?)):(?:\s+(.*?))?\s*$/.exec(line);
  if (match === null) return null;
  return {
    key: match[1] ?? match[2] ?? (match[3] ?? "").trim(),
    value: match[4] ?? "",
  };
}

/** Unquotes a lockfile value and strips any `(...)` peer suffix. */
function lockValue(raw: string): string {
  return unquote(raw)
    .replace(/\s*\(.*\)\s*$/, "")
    .trim();
}

/** A dependency entry inside a lockfile section: inline or nested fields. */
interface DepEntry {
  /** Inline value (`pkg: 1.0.1`) or the nested `version:` line. */
  value: string;
  /** The nested `specifier:` line, when the format records one. */
  specifier?: string;
}

/** The `pkg` entry inside one dependency section's key list. */
function depSectionEntry(
  lines: string[],
  from: number,
  sectionIndent: number,
  pkg: string,
): DepEntry | undefined {
  for (let i = from; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line.trim() === "") continue;
    const indent = indentOf(line);
    if (indent <= sectionIndent) return undefined;
    const entry = yamlKeyValue(line);
    if (entry === null || entry.key !== pkg) continue;
    if (entry.value !== "") return { value: entry.value };
    let value = "";
    let specifier: string | undefined;
    for (let j = i + 1; j < lines.length; j += 1) {
      const sub = lines[j] as string;
      if (sub.trim() === "") continue;
      if (indentOf(sub) <= indent) break;
      const pair = yamlKeyValue(sub);
      if (pair?.key === "version") value = pair.value;
      if (pair?.key === "specifier") specifier = pair.value;
    }
    return { value, specifier };
  }
  return undefined;
}

/** The `pkg` entry the importer's dependency sections record, if any. */
function pnpmDepEntry(
  text: string,
  importer: string,
  pkg: string,
): DepEntry | null {
  const lines = text.split(/\r?\n/);
  let start = 0;
  let end = lines.length;
  let baseIndent = -1;
  const importers = lines.findIndex((line) => /^importers:\s*$/.test(line));
  if (importers !== -1) {
    start = -1;
    let keyIndent = -1;
    for (let i = importers + 1; i < lines.length; i += 1) {
      const line = lines[i] as string;
      if (line.trim() === "") continue;
      const indent = indentOf(line);
      if (indent === 0) break;
      if (keyIndent === -1) keyIndent = indent;
      if (indent !== keyIndent) continue;
      const entry = yamlKeyValue(line);
      if (entry === null) break;
      if (entry.key !== importer) continue;
      start = i + 1;
      baseIndent = indent;
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j] as string;
        if (next.trim() !== "" && indentOf(next) <= indent) {
          end = j;
          break;
        }
      }
      break;
    }
    if (start === -1) return null;
  } else if (importer !== ".") {
    return null;
  }
  let found: DepEntry | undefined;
  let specifier: string | undefined;
  let childIndent: number | undefined;
  for (let i = start; i < end; i += 1) {
    const line = lines[i] as string;
    if (line.trim() === "") continue;
    const indent = indentOf(line);
    if (childIndent === undefined) childIndent = indent;
    if (indent <= baseIndent) break;
    if (indent !== childIndent) continue;
    const entry = yamlKeyValue(line);
    if (entry === null) continue;
    if (entry.key === "specifiers") {
      const recorded = depSectionEntry(lines, i + 1, indent, pkg);
      if (recorded !== undefined) {
        specifier = recorded.specifier ?? recorded.value;
      }
      continue;
    }
    if (!dependencySections.includes(entry.key) || found !== undefined)
      continue;
    found = depSectionEntry(lines, i + 1, indent, pkg);
  }
  return found === undefined
    ? null
    : { ...found, specifier: found.specifier ?? specifier };
}

/** The version `pkg` resolves to for `importer` in a pnpm-lock.yaml. */
function pnpmLockedVersion(
  text: string,
  importer: string,
  pkg: string,
): string | null {
  const entry = pnpmDepEntry(text, importer, pkg);
  if (entry === null) return null;
  const resolved = lockValue(entry.value);
  return semverStart.test(resolved) ? resolved : null;
}

/** The specifier pnpm records for `pkg` under `importer`. */
function pnpmLockedSpec(
  text: string,
  importer: string,
  pkg: string,
): string | null | undefined {
  const entry = pnpmDepEntry(text, importer, pkg);
  if (entry === null) return null;
  // An inline value (older format) has no recorded specifier.
  return entry.specifier === undefined ? undefined : unquote(entry.specifier);
}

function yarnDescriptorHeader(
  lines: string[],
  pkg: string,
  spec: string,
): number | null {
  const wanted = new Set([`${pkg}@${spec}`, `${pkg}@npm:${spec}`]);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    const trimmed = line.trimEnd();
    if (trimmed === "" || /^\s/.test(line) || !trimmed.endsWith(":")) continue;
    // Classic quotes each descriptor; berry quotes the whole list.
    const descriptors = trimmed
      .slice(0, -1)
      .replace(/"/g, "")
      .split(",")
      .map((descriptor) => descriptor.trim());
    if (!descriptors.some((descriptor) => wanted.has(descriptor))) continue;
    return i;
  }
  return null;
}

function yarnEntryVersion(lines: string[], header: number): string | null {
  for (let i = header + 1; i < lines.length; i += 1) {
    const entry = lines[i] as string;
    if (entry.trim() === "") continue;
    if (!/^\s/.test(entry)) break;
    // Handles both `version "1.0.1"` (classic) and `version: 1.0.1`.
    const version = /^\s+version:?\s+"?([^"\s]+)"?\s*$/.exec(entry);
    if (version !== null) return version[1] as string;
  }
  return null;
}

/** The version the `${pkg}@${spec}` (or `npm:`) entry resolves in yarn.lock. */
function yarnLockedVersion(
  text: string,
  pkg: string,
  spec: string,
): string | null {
  const lines = text.split(/\r?\n/);
  const header = yarnDescriptorHeader(lines, pkg, spec);
  if (header === null) return null;
  const version = yarnEntryVersion(lines, header);
  if (version === null) return null;
  const resolved = lockValue(version);
  return semverStart.test(resolved) ? resolved : null;
}

function yarnLockedSpec(
  text: string,
  pkg: string,
  spec: string,
): string | null {
  const lines = text.split(/\r?\n/);
  const header = yarnDescriptorHeader(lines, pkg, spec);
  return header !== null && yarnEntryVersion(lines, header) !== null
    ? spec
    : null;
}

/** Parses a bun.lock (JSONC with trailing commas) into its two maps. */
function parseBunLock(text: string): {
  workspaces: Record<string, unknown>;
  packages: Record<string, unknown>;
} | null {
  let json: unknown;
  try {
    // Trailing commas never appear inside bun.lock's strings.
    json = JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return null;
  }
  if (json === null || typeof json !== "object") return null;
  const root = json as { workspaces?: unknown; packages?: unknown };
  return {
    workspaces:
      root.workspaces !== null && typeof root.workspaces === "object"
        ? (root.workspaces as Record<string, unknown>)
        : {},
    packages:
      root.packages !== null && typeof root.packages === "object"
        ? (root.packages as Record<string, unknown>)
        : {},
  };
}

/** The version `pkg` resolves to for `importer` in a bun.lock (JSONC). */
function bunLockedVersion(
  text: string,
  importer: string,
  pkg: string,
): string | null {
  const lock = parseBunLock(text);
  if (lock === null) return null;
  const workspace =
    (lock.workspaces[importer === "." ? "" : importer] as { name?: unknown })
      ?.name ?? null;
  const entry =
    (typeof workspace === "string"
      ? lock.packages[`${workspace}/${pkg}`]
      : undefined) ?? lock.packages[pkg];
  const resolved = Array.isArray(entry) ? entry[0] : undefined;
  if (typeof resolved !== "string") return null;
  const version = resolved.slice(resolved.lastIndexOf("@") + 1);
  return semverStart.test(version) ? version : null;
}

const specFields = [...dependencySections, "peerDependencies"];

/** The spec `manifest` declares for `pkg`, in any dependency field. */
function manifestSpec(
  manifest: unknown,
  pkg: string,
): string | null | undefined {
  if (manifest === null || typeof manifest !== "object") return null;
  for (const field of specFields) {
    const deps = (manifest as Record<string, unknown>)[field];
    if (deps === null || typeof deps !== "object") continue;
    const spec = (deps as Record<string, unknown>)[pkg];
    if (typeof spec === "string") return spec;
  }
  return null;
}

/** The spec the bun.lock workspace for `importer` records for `pkg`. */
function bunLockedSpec(
  text: string,
  importer: string,
  pkg: string,
): string | null | undefined {
  const lock = parseBunLock(text);
  if (lock === null) return undefined;
  return manifestSpec(lock.workspaces[importer === "." ? "" : importer], pkg);
}

/** The spec a v2/v3 npm lockfile's `packages[rel]` records for `pkg`. */
function npmLockedSpec(
  json: unknown,
  rel: string,
  pkg: string,
): string | null | undefined {
  const packages = npmLockPackages(json);
  if (Object.keys(packages).length === 0) return undefined;
  return manifestSpec(packages[rel], pkg);
}

/**
 * The version the lockfile resolves for the workspace at `importer` (the
 * declaring dir relative to the lockfile's dir, "." for the lockfile dir).
 * null when the lockfile format doesn't record per-workspace resolutions.
 */
function lockedVersion(
  lockPath: string,
  text: string,
  importer: string,
  pkg: string,
  spec: string,
): string | null {
  const name = lockPath.split("/").at(-1) ?? "";
  if (name === "pnpm-lock.yaml") return pnpmLockedVersion(text, importer, pkg);
  if (name === "yarn.lock") return yarnLockedVersion(text, pkg, spec);
  if (name === "bun.lock") return bunLockedVersion(text, importer, pkg);
  return null;
}

/**
 * The range the lockfile records for the workspace's dependency on `pkg`.
 * undefined when the format doesn't record it; null when the workspace has
 * no entry for `pkg` at all.
 */
function lockedSpec(
  lockPath: string,
  text: string,
  importer: string,
  pkg: string,
  spec: string,
): string | null | undefined {
  const name = lockPath.split("/").at(-1) ?? "";
  if (name === "pnpm-lock.yaml") return pnpmLockedSpec(text, importer, pkg);
  if (name === "bun.lock") return bunLockedSpec(text, importer, pkg);
  if (name === "yarn.lock") return yarnLockedSpec(text, pkg, spec);
  if (npmLockPattern.test(lockPath)) {
    return npmLockedSpec(
      parseJson(text),
      importer === "." ? "" : importer,
      pkg,
    );
  }
  return undefined;
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
    const lockfiles: typeof changed = [];
    for (const file of changed) {
      if (!isLockfile(file.path) || file.status === "deleted") continue;
      if (await isShadowedPackageLock(ctx, file.path)) continue;
      lockfiles.push(file);
    }
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
        const currentSpec = specFor(
          dependencies(parseJson(await ctx.read(file))),
          pkg,
        );
        const specChanged = currentSpec !== declaredSpec;
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
        // A bumped range the lockfile doesn't record means it is out of
        // sync with package.json; a frozen install would reject it.
        if (specChanged && lock !== null && currentSpec !== undefined) {
          const importer =
            path.posix.relative(dirOf(lock) || ".", dir || ".") || ".";
          const lockText = await ctx.read(lock);
          const recorded = lockedSpec(
            lock,
            lockText ?? "",
            importer,
            pkg,
            currentSpec ?? declaredSpec,
          );
          if (
            recorded === null ||
            (typeof recorded === "string" && recorded !== currentSpec)
          ) {
            partial = true;
            installReasons.add(
              recorded === null && lock.endsWith("pnpm-lock.yaml")
                ? `${lock} has no ${pkg} entry reachable from ${dir === "" ? "the repo root" : dir}; the bump was never installed (a clean install may reject it).`
                : `${file} declares ${pkg} ${currentSpec} but ${lock} still records ${recorded ?? "no entry"} for it; the bump was never installed (a clean install may reject it).`,
            );
            continue;
          }
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
          if (locked !== undefined) {
            expected = [locked];
          } else if (Object.keys(packages).length === 0) {
            expected = npmLockVersionList(json, pkg);
          } else {
            // A v2/v3 lockfile that doesn't install pkg for this workspace.
            partial = true;
            installReasons.add(
              `${lock} has no ${pkg} entry reachable from ${dir === "" ? "the repo root" : dir}; the bump was never installed (a clean install may reject it).`,
            );
            continue;
          }
        } else if (lock !== null && !lock.endsWith(".lockb")) {
          const text = await ctx.read(lock);
          const importer =
            path.posix.relative(dirOf(lock) || ".", dir || ".") || ".";
          const recordedSpec = lockedSpec(
            lock,
            text ?? "",
            importer,
            pkg,
            currentSpec ?? declaredSpec,
          );
          if (recordedSpec === null) {
            partial = true;
            installReasons.add(
              `${lock} has no ${pkg} entry reachable from ${dir === "" ? "the repo root" : dir}; the bump was never installed (a clean install may reject it).`,
            );
            continue;
          }
          const locked = lockedVersion(
            lock,
            text ?? "",
            importer,
            pkg,
            currentSpec ?? declaredSpec,
          );
          if (locked !== null) {
            expected = [locked];
          } else {
            const before = lockfileVersions(await ctx.readBaseline(lock), pkg);
            const after = lockfileVersions(text, pkg);
            const added = after.filter((version) => !before.includes(version));
            // The newly added version only applies to workspaces whose spec
            // changed; untouched ones keep the full locked list.
            expected = specChanged && added.length > 0 ? added : after;
          }
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
