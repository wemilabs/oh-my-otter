import type { RepoContext, CommandResult } from "../types";
import type { LintRun } from "./eslint";

const BIOME_GROUPS = new Set([
  "a11y",
  "complexity",
  "correctness",
  "nursery",
  "performance",
  "security",
  "style",
  "suspicious",
]);

export function biomeRule(rule: string): string | null {
  const match = /^(lint\/)?([a-z]+)\/([a-zA-Z]+)$/.exec(rule);
  if (!match) return null;
  const [, prefix, group, name] = match;
  if (!prefix && !BIOME_GROUPS.has(group!)) return null;
  return `lint/${group}/${name}`;
}

function unescapeProperty(value: string): string {
  return value.replace(/%(25|0D|0A|3A|2C)/gi, (encoded) => {
    switch (encoded.toUpperCase()) {
      case "%25":
        return "%";
      case "%0D":
        return "\r";
      case "%0A":
        return "\n";
      case "%3A":
        return ":";
      case "%2C":
        return ",";
      default:
        return encoded;
    }
  });
}

function relativeFile(file: string, root: string): string {
  const normalizedFile = file.replace(/\\/g, "/");
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/$/, "");
  const prefix = `${normalizedRoot}/`;
  const windows = /^[A-Za-z]:\//.test(normalizedRoot);
  const candidate = windows ? normalizedFile.toLowerCase() : normalizedFile;
  const normalizedPrefix = windows ? prefix.toLowerCase() : prefix;
  return candidate.startsWith(normalizedPrefix)
    ? normalizedFile.slice(prefix.length)
    : normalizedFile;
}

export function parseBiomeGithub(
  result: CommandResult,
  rule: string,
  root: string,
): LintRun {
  const lines = result.stdout.split(/\r?\n/);
  const workflowLines = lines.filter((line) => /^::/.test(line));
  if (result.code !== 0 && workflowLines.length === 0) {
    const detail = (result.stderr || result.stdout).trim().split(/\r?\n/)[0];
    throw new Error(`Biome could not run: ${detail || "no output"}`);
  }

  let count = 0;
  let fatal = 0;
  const files: string[] = [];
  const seen = new Set<string>();
  const fatalFiles = new Set<string>();
  for (const line of workflowLines) {
    const match = /^::(error|warning|notice)\s+(.+?)::/.exec(line);
    if (!match) continue;
    const properties: Record<string, string> = {};
    for (const item of match[2]!.split(",")) {
      const separator = item.indexOf("=");
      if (separator < 0) continue;
      properties[item.slice(0, separator)] = unescapeProperty(
        item.slice(separator + 1),
      );
    }
    if (properties.title !== rule) {
      if (
        match[1] === "error" &&
        !(properties.title ?? "").startsWith("lint/")
      ) {
        fatal += 1;
        if (properties.file) {
          fatalFiles.add(relativeFile(properties.file, root));
        }
      }
      continue;
    }
    count += 1;
    if (properties.file) {
      const file = relativeFile(properties.file, root);
      if (!seen.has(file)) {
        seen.add(file);
        files.push(file);
      }
    }
  }
  return { count, files, fatal, fatalFiles: [...fatalFiles].sort() };
}

export async function runBiome(
  ctx: RepoContext,
  rule: string,
): Promise<LintRun> {
  const result = await ctx.runPackageBin(
    "@biomejs/biome",
    ["lint", ".", "--reporter=github", "--max-diagnostics=none"],
    "biome",
  );
  if (result === null) {
    throw new Error(
      "Biome is not installed locally (node_modules/@biomejs/biome).",
    );
  }
  if (result.timedOut) throw new Error("Biome timed out.");
  return parseBiomeGithub(result, rule, ctx.root);
}

const suppressionPattern = /biome-ignore(?:-all|-start)?(?![\w-])\s+([^:\n]*)/g;

export function countBiomeSuppressions(source: string, rule: string): number {
  const group = rule.split("/").slice(0, 2).join("/");
  let count = 0;
  for (const match of source.matchAll(suppressionPattern)) {
    const categories = (match[1] ?? "")
      .split(/\s+/)
      .map((value) => value.replace(/\([^)]*\)$/, ""))
      .filter(Boolean);
    if (
      categories.some((category) => [rule, group, "lint"].includes(category))
    ) {
      count += 1;
    }
  }
  return count;
}

const configPattern = /(?:^|\/)\.?biome\.jsonc?$/;

export function isBiomeConfig(file: string): boolean {
  return configPattern.test(file.replace(/\\/g, "/"));
}
