import type { CheckContext, ScanReport } from "@oh-my-otter/core";
import { BUILTIN_CHECK_IDS, type ScanSummary, type Stack } from "./scan";

type PackageManager = Stack["package_manager"];

const lockfileManagers: [PackageManager, string[]][] = [
  ["pnpm", ["pnpm-lock.yaml"]],
  ["yarn", ["yarn.lock"]],
  ["bun", ["bun.lock", "bun.lockb"]],
  ["npm", ["package-lock.json", "npm-shrinkwrap.json"]],
];

async function readJson(
  ctx: CheckContext,
  file: string,
): Promise<Record<string, unknown> | null> {
  const text = await ctx.read(file);
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function depNames(pkg: Record<string, unknown> | null): Set<string> {
  const names = new Set<string>();
  if (!pkg) return names;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = pkg[field];
    if (deps !== null && typeof deps === "object" && !Array.isArray(deps)) {
      for (const name of Object.keys(deps)) names.add(name);
    }
  }
  return names;
}

const DEFAULT_WORKSPACE_GLOBS = ["apps/*", "packages/*"];
const MAX_WORKSPACE_MANIFESTS = 200;

function packageJsonWorkspaces(pkg: Record<string, unknown>): string[] {
  const workspaces = pkg.workspaces;
  if (Array.isArray(workspaces)) {
    return workspaces.filter((w): w is string => typeof w === "string");
  }
  if (workspaces !== null && typeof workspaces === "object") {
    const packages = (workspaces as Record<string, unknown>).packages;
    if (Array.isArray(packages)) {
      return packages.filter((w): w is string => typeof w === "string");
    }
  }
  return [];
}

/** Minimal parser: the `packages:` list in pnpm-workspace.yaml. */
function pnpmWorkspaceGlobs(yaml: string): string[] {
  const globs: string[] = [];
  let inPackages = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const clean = line.replace(/\s+#.*$/, "");
    const item = /^\s+-\s*['"]?([^'"\s#]+)['"]?\s*$/.exec(clean);
    if (item) {
      globs.push(item[1]!);
      continue;
    }
    if (/^\S/.test(clean)) break; // next top-level key
  }
  return globs;
}

function safeGlob(glob: string): string | null {
  const trimmed = glob.trim().replace(/\/+$/, "");
  if (trimmed === "" || trimmed.startsWith("!")) return null;
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) return null;
  return trimmed;
}

async function workspacePackageJsons(
  ctx: CheckContext,
  maxManifests = MAX_WORKSPACE_MANIFESTS,
): Promise<string[]> {
  const globs: string[] = [];
  const seen = new Set<string>();
  const add = (glob: string) => {
    const safe = safeGlob(glob);
    if (safe !== null && !seen.has(safe)) {
      seen.add(safe);
      globs.push(safe);
    }
  };
  for (const glob of packageJsonWorkspaces(ctx.packageJson ?? {})) add(glob);
  const pnpmYaml = await ctx.read("pnpm-workspace.yaml");
  if (pnpmYaml !== null) {
    for (const glob of pnpmWorkspaceGlobs(pnpmYaml)) add(glob);
  }
  for (const glob of DEFAULT_WORKSPACE_GLOBS) add(glob);
  const found = new Set<string>();
  for (const glob of globs) {
    for (const file of await ctx.glob(`${glob}/package.json`)) {
      found.add(file);
      if (found.size >= maxManifests) return [...found];
    }
  }
  return [...found];
}

export async function detectStack(
  ctx: CheckContext,
  maxManifests = MAX_WORKSPACE_MANIFESTS,
): Promise<Stack> {
  const hasPackageJson = ctx.packageJson !== null;

  let packageManager: PackageManager = hasPackageJson ? "npm" : "other";
  const declared = ctx.packageJson?.packageManager;
  const declaredMatch =
    typeof declared === "string"
      ? /^(pnpm|yarn|npm|bun)@/.exec(declared)
      : null;
  if (declaredMatch) {
    packageManager = declaredMatch[1] as PackageManager;
  } else {
    for (const [manager, lockfiles] of lockfileManagers) {
      for (const file of lockfiles) {
        if (await ctx.exists(file)) {
          packageManager = manager;
          break;
        }
      }
      if (packageManager === manager) break;
    }
  }

  const workspaceDirs = (await workspacePackageJsons(ctx, maxManifests)).map(
    (file) => file.split("/").slice(0, -1).join("/"),
  );

  const deps = depNames(ctx.packageJson);
  for (const dir of workspaceDirs) {
    for (const name of depNames(await readJson(ctx, `${dir}/package.json`))) {
      deps.add(name);
    }
  }

  let hasTsconfig = await ctx.exists("tsconfig.json");
  for (const dir of workspaceDirs) {
    if (hasTsconfig) break;
    hasTsconfig = await ctx.exists(`${dir}/tsconfig.json`);
  }
  const language: Stack["language"] =
    hasTsconfig || deps.has("typescript") ? "typescript" : "javascript";

  let framework: Stack["framework"];
  if (deps.has("next")) framework = "nextjs";
  else if (deps.has("astro")) framework = "astro";
  else if (deps.has("svelte") || deps.has("@sveltejs/kit"))
    framework = "svelte";
  else if (deps.has("vue") || deps.has("nuxt")) framework = "vue";
  else if (deps.has("react")) framework = "react";
  else framework = hasPackageJson ? "node" : "other";

  return {
    package_manager: packageManager,
    language,
    framework,
  };
}

export function summarizeScan(report: ScanReport, stack: Stack): ScanSummary {
  const builtin = new Set<string>(BUILTIN_CHECK_IDS);
  const checks: Record<string, string> = {};
  for (const { check, result } of report.outcomes) {
    if (builtin.has(check.id)) checks[check.id] = result.status;
  }
  return {
    scoring_version: report.score.scoring_version,
    readiness_score: report.score.score,
    checks: checks as ScanSummary["checks"],
    stack,
  };
}
