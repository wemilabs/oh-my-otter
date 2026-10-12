import type { CheckContext } from "@oh-my-otter/core";

const readmeNames = new Set([
  "readme",
  "readme.md",
  "readme.mdx",
  "readme.markdown",
  "readme.txt",
  "readme.rst",
]);

export async function findReadme(ctx: CheckContext): Promise<string | null> {
  const files = await ctx.glob("*");
  return files.find((file) => readmeNames.has(file.toLowerCase())) ?? null;
}
