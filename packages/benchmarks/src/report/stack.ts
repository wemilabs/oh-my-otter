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

export async function detectStack(ctx: CheckContext): Promise<Stack> {
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

  const workspaceDirs = [
    ...(await ctx.glob("apps/*/package.json")),
    ...(await ctx.glob("packages/*/package.json")),
  ].map((file) => file.split("/").slice(0, -1).join("/"));

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
