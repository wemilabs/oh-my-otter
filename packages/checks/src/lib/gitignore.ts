import ignore from "ignore";
import type { CheckContext } from "@oh-my-otter/core";

export async function isGitignored(
  ctx: CheckContext,
  relPath: string,
): Promise<boolean> {
  const contents = await ctx.read(".gitignore");
  return contents !== null && ignore().add(contents).ignores(relPath);
}
