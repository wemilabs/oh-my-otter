import { appendFile, lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const OMOT_DIR = ".omot";
export const OMOT_IGNORE_LINE = ".omot/";
const omotPatterns = new Set([
  ".omot",
  ".omot/",
  "/.omot",
  "/.omot/",
  ".omot/*",
  ".omot/**",
  "/.omot/*",
  "/.omot/**",
]);

export function gitignoreIgnoresOmot(contents: string): boolean {
  return contents.split(/\r?\n/).some((line) => omotPatterns.has(line.trim()));
}

export function withoutOmotLines(contents: string): string {
  return contents
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !omotPatterns.has(line.trim()))
    .join("\n")
    .replace(/\n+$/, "");
}

export type GitignorePlan =
  | { action: "none" }
  | { action: "append" | "create"; text: string }
  | { action: "skip"; reason: string };

export async function planGitignore(root: string): Promise<GitignorePlan> {
  const file = path.join(root, ".gitignore");
  let info;
  try {
    info = await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { action: "create", text: `${OMOT_IGNORE_LINE}\n` };
    }
    throw error;
  }
  if (!info.isFile()) {
    return {
      action: "skip",
      reason: ".gitignore is not a regular file; add .omot/ to it manually.",
    };
  }
  const contents = await readFile(file, "utf8");
  if (gitignoreIgnoresOmot(contents)) return { action: "none" };
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  const prefix = contents.length > 0 && !contents.endsWith("\n") ? newline : "";
  return { action: "append", text: `${prefix}${OMOT_IGNORE_LINE}${newline}` };
}

export async function applyGitignore(
  root: string,
  plan: GitignorePlan,
): Promise<void> {
  const file = path.join(root, ".gitignore");
  if (plan.action === "create") {
    await writeFile(file, plan.text, { flag: "wx" });
  } else if (plan.action === "append") {
    const info = await lstat(file);
    if (!info.isFile()) throw new Error(".gitignore is not a regular file.");
    await appendFile(file, plan.text);
  }
}
