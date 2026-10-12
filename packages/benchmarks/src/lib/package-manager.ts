import type { PackageManager } from "../types";

const lockfilesByManager: Array<[PackageManager, string[]]> = [
  ["pnpm", ["pnpm-lock.yaml"]],
  ["yarn", ["yarn.lock"]],
  ["bun", ["bun.lock", "bun.lockb"]],
  ["npm", ["package-lock.json", "npm-shrinkwrap.json"]],
];

export async function detectPackageManager(
  packageJson: Record<string, unknown> | null,
  exists: (file: string) => Promise<boolean>,
): Promise<PackageManager> {
  const declared = packageJson?.packageManager;
  if (typeof declared === "string") {
    const match = /^(pnpm|npm|yarn|bun)@/.exec(declared);
    if (match) return match[1] as PackageManager;
  }
  for (const [manager, names] of lockfilesByManager) {
    for (const name of names) {
      if (await exists(name)) return manager;
    }
  }
  return "npm";
}
