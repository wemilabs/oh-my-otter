import type { CommandResult, RepoContext } from "../types";

export interface LintRun {
  count: number;
  files: string[];
  fatal: number;
  fatalFiles: string[];
}

interface EslintMessage {
  ruleId?: string | null;
  fatal?: boolean;
}

interface EslintFileResult {
  filePath?: string;
  messages?: EslintMessage[];
}

export function parseEslintJson(
  result: CommandResult,
  rule: string,
  root: string,
): LintRun {
  const start = result.stdout.indexOf("[");
  let parsed: unknown;
  try {
    parsed = JSON.parse(start >= 0 ? result.stdout.slice(start) : "");
  } catch {
    const detail = (result.stderr || result.stdout).trim().split(/\r?\n/)[0];
    throw new Error(
      `ESLint did not produce JSON output: ${detail ?? "no output"}`,
    );
  }
  if (!Array.isArray(parsed))
    throw new Error("ESLint JSON output is not an array.");
  let count = 0;
  let fatal = 0;
  const files: string[] = [];
  const fatalFiles = new Set<string>();
  const prefix = root.replace(/\\/g, "/").replace(/\/$/, "") + "/";
  for (const entry of parsed as EslintFileResult[]) {
    const messages = entry.messages ?? [];
    const file = (entry.filePath ?? "").replace(/\\/g, "/");
    const relative = file.startsWith(prefix) ? file.slice(prefix.length) : file;
    const fatalMessages = messages.filter((message) => message.fatal);
    fatal += fatalMessages.length;
    if (fatalMessages.length > 0 && relative) fatalFiles.add(relative);
    const matching = messages.filter(
      (message) => message.ruleId === rule,
    ).length;
    if (matching > 0) {
      count += matching;
      files.push(relative);
    }
  }
  return { count, files, fatal, fatalFiles: [...fatalFiles].sort() };
}

export async function runEslint(
  ctx: RepoContext,
  rule: string,
): Promise<LintRun> {
  const result = await ctx.runPackageBin("eslint", [
    ".",
    "--format",
    "json",
    "--no-error-on-unmatched-pattern",
  ]);
  if (result === null) {
    throw new Error("ESLint is not installed locally (node_modules/eslint).");
  }
  return parseEslintJson(result, rule, ctx.root);
}

const disablePattern =
  /eslint-disable(?:-next-line|-line)?(?![\w-])([^\n*]*(?:\*(?!\/)[^\n*]*)*)/g;

/** Counts eslint-disable directives that cover `rule` (including blanket ones). */
export function countDisables(source: string, rule: string): number {
  let count = 0;
  for (const match of source.matchAll(disablePattern)) {
    const rules = (match[1] ?? "")
      .split("--")[0]!
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (rules.length === 0 || rules.includes(rule)) count += 1;
  }
  return count;
}

const configPattern =
  /(?:^|\/)(?:eslint\.config\.[cm]?[jt]s|\.eslintrc(?:\.[a-z]+)?|\.eslintignore)$/;

export function isEslintConfig(file: string): boolean {
  return configPattern.test(file.replace(/\\/g, "/"));
}
