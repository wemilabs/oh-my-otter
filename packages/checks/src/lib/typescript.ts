import type { CheckContext } from "@oh-my-otter/core";

export async function isTypeScriptRepo(ctx: CheckContext): Promise<boolean> {
  if (await ctx.exists("tsconfig.json")) return true;
  const pkg = ctx.packageJson;
  for (const field of ["dependencies", "devDependencies"]) {
    const deps = pkg?.[field];
    if (
      deps !== null &&
      typeof deps === "object" &&
      !Array.isArray(deps) &&
      "typescript" in deps
    ) {
      return true;
    }
  }
  const files = await ctx.glob("**/*.{ts,tsx,mts,cts}");
  return files.some((file) => !file.endsWith(".d.ts"));
}
