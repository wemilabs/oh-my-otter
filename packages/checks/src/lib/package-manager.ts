import type { CheckContext } from "@oh-my-otter/core";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export const lockfiles: Record<PackageManager, string[]> = {
  pnpm: ["pnpm-lock.yaml"],
  npm: ["package-lock.json", "npm-shrinkwrap.json"],
  yarn: ["yarn.lock"],
  bun: ["bun.lockb", "bun.lock"],
};

export async function lockfilesPresent(
  ctx: CheckContext,
): Promise<Partial<Record<PackageManager, string[]>>> {
  const present: Partial<Record<PackageManager, string[]>> = {};
  for (const [manager, names] of Object.entries(lockfiles) as [
    PackageManager,
    string[],
  ][]) {
    const found: string[] = [];
    for (const name of names) {
      if (await ctx.exists(name)) found.push(name);
    }
    if (found.length > 0) present[manager] = found;
  }
  return present;
}

export function declaredPackageManager(
  ctx: CheckContext,
): PackageManager | null {
  const pkgManager = ctx.packageJson?.packageManager;
  if (typeof pkgManager !== "string") return null;
  const match = /^(pnpm|npm|yarn|bun)@/.exec(pkgManager);
  return (match?.[1] as PackageManager | undefined) ?? null;
}

export async function detectPackageManager(
  ctx: CheckContext,
): Promise<PackageManager> {
  const declared = declaredPackageManager(ctx);
  if (declared) return declared;
  const present = await lockfilesPresent(ctx);
  const found = Object.keys(present) as PackageManager[];
  return found[0] ?? "npm";
}

export function installCommand(manager: PackageManager): string {
  return `${manager} install`;
}

export function testCommand(manager: PackageManager): string {
  if (manager === "bun") return "bun run test";
  return `${manager} test`;
}
