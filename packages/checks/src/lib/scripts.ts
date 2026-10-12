import type { CheckContext } from "@oh-my-otter/core";

export function packageScripts(ctx: CheckContext): Record<string, string> {
  const scripts = ctx.packageJson?.scripts;
  if (
    scripts === null ||
    typeof scripts !== "object" ||
    Array.isArray(scripts)
  ) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(scripts).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].trim().length > 0,
    ),
  );
}

export function hasUsableTestScript(ctx: CheckContext): boolean {
  const test = packageScripts(ctx).test;
  return Boolean(test && !test.toLowerCase().includes("no test specified"));
}
