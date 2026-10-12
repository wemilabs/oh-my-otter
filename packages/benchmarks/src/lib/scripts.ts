import type { VerifyContext } from "../types";

function scriptsOf(text: string | null): Record<string, unknown> {
  if (text === null) return {};
  try {
    const scripts = (JSON.parse(text) as { scripts?: unknown }).scripts;
    return scripts && typeof scripts === "object"
      ? (scripts as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Names of root package.json scripts whose command differs from the baseline. */
export async function changedScripts(
  ctx: VerifyContext,
  names: readonly string[],
): Promise<string[]> {
  const before = scriptsOf(await ctx.readBaseline("package.json"));
  const after = scriptsOf(await ctx.read("package.json"));
  return names.filter((name) => before[name] !== after[name]);
}

export function scriptChangeReason(names: readonly string[]): string {
  return `package.json scripts changed since the baseline: ${names.join(", ")}.`;
}
