import { defineCheck } from "@oh-my-otter/core";
import { findReadme } from "../lib/readme";
import { detectPackageManager, installCommand } from "../lib/package-manager";

const setupHeading =
  /^#{1,6}\s+.*(?:install|setup|set up|getting started|quick ?start|development)/im;
const packageManagerInstallPattern =
  /\b(?:pnpm|npm|bun)\s+(?:install|i|ci|add)\b/i;
const yarnInstallPattern = /\byarn\s+(?:install|add)\b/i;
const anchoredInstallPattern = /^(?:pnpm|npm|bun)\s+(?:install|i|ci|add)\b/i;
const anchoredYarnInstallPattern = /^yarn\s+(?:install|add)\b/i;
const yarnOnlyPattern =
  /^yarn(?!.*\s(?:--version|-v|--help|-h)\b)(?:\s+--?[\w-]+(?:=\S+)?)*\s*$/;
const proseInstallPattern =
  /\b(?:pnpm|npm|bun)\s+(?:install|i|ci)\b|\byarn\s+install\b/i;
const htmlCommentPattern = /<!--[\s\S]*?-->/g;
const yarnProsePattern = /\b(?:run|running|execute|executing|type|enter)\s*$/i;

function hasPlainYarn(text: string): boolean {
  return text
    .split(/&&|\|\||;/)
    .some((piece) =>
      yarnOnlyPattern.test(piece.trim().replace(/^[$>]\s+/, "")),
    );
}

function stripShellComment(line: string): string {
  let quote: string | null = null;
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (char === "\\" && quote === '"') {
      index++;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || /\s/.test(line[index - 1]!))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function codeLineHasCommand(line: string): boolean {
  const uncommented = stripShellComment(line);
  return (
    packageManagerInstallPattern.test(uncommented) ||
    yarnInstallPattern.test(uncommented) ||
    hasPlainYarn(uncommented)
  );
}

function stripHtmlComments(line: string, state: { open: boolean }): string {
  let result = "";
  let cursor = 0;
  while (cursor < line.length) {
    if (state.open) {
      const close = line.indexOf("-->", cursor);
      if (close === -1) return result;
      state.open = false;
      cursor = close + 3;
      continue;
    }
    const open = line.indexOf("<!--", cursor);
    if (open === -1) return result + line.slice(cursor);
    result += line.slice(cursor, open);
    const close = line.indexOf("-->", open + 4);
    if (close === -1) {
      state.open = true;
      return result;
    }
    cursor = close + 3;
  }
  return result;
}

function codeTextHasCommand(text: string): boolean {
  return text.split("\n").some(codeLineHasCommand);
}

function plainTextHasCommand(contents: string): boolean {
  for (const line of contents.split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    if (proseInstallPattern.test(line)) return true;
    const stripped = line.replace(/^\s*(?:[$>]\s+)?/, "");
    if (
      anchoredInstallPattern.test(stripped) ||
      anchoredYarnInstallPattern.test(stripped) ||
      yarnOnlyPattern.test(stripped)
    ) {
      return true;
    }
  }
  return false;
}

function markdownHasCommand(contents: string): boolean {
  const masked = contents.split("");
  const blank = (start: number, end: number) => {
    for (let index = start; index < end; index++) masked[index] = " ";
  };
  const lines = contents.split("\n");
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }

  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  const fencedComment = { open: false };
  const indentedComment = { open: false };
  let indentedCodeAllowed = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.replace(/\r$/, "");
    if (inFence) {
      blank(offsets[index]!, offsets[index]! + line.length);
      if (
        new RegExp(`^[ \t]*${fenceChar}{${fenceLength},}[ \t]*$`).test(line)
      ) {
        inFence = false;
        fencedComment.open = false;
      } else if (codeLineHasCommand(stripHtmlComments(line, fencedComment))) {
        return true;
      }
      continue;
    }
    const fence = /^[ \t]*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      inFence = true;
      fenceChar = fence[1]![0]!;
      fenceLength = fence[1]!.length;
      fencedComment.open = false;
      blank(offsets[index]!, offsets[index]! + line.length);
      continue;
    }
    const indented = /^(?: {4}|\t)/.test(line);
    if (indented && indentedCodeAllowed) {
      blank(offsets[index]!, offsets[index]! + line.length);
      if (codeLineHasCommand(stripHtmlComments(line, indentedComment))) {
        return true;
      }
    } else if (line.trim() !== "") {
      indentedComment.open = false;
    }
    indentedCodeAllowed = indented || line.trim() === "";
  }

  for (const match of masked.join("").matchAll(htmlCommentPattern)) {
    blank(match.index!, match.index! + match[0].length);
  }
  const uncommented = masked.join("");
  for (const match of uncommented.matchAll(
    /<(pre|code)\b[^>]*>([\s\S]*?)<\/\1>/gi,
  )) {
    if (codeTextHasCommand(match[2] ?? "")) return true;
    blank(match.index!, match.index! + match[0].length);
  }
  const stripped = masked.join("");
  for (const match of stripped.matchAll(/(`+)([\s\S]*?)\1/g)) {
    const span = match[2] ?? "";
    if (
      packageManagerInstallPattern.test(span) ||
      yarnInstallPattern.test(span)
    ) {
      return true;
    }
    if (
      hasPlainYarn(span) &&
      yarnProsePattern.test(stripped.slice(0, match.index))
    ) {
      return true;
    }
  }
  return proseInstallPattern.test(stripped);
}

function hasInstallCommand(contents: string, readme: string): boolean {
  const name = readme.toLowerCase();
  if (name === "readme" || name === "readme.txt") {
    return plainTextHasCommand(contents);
  }
  return markdownHasCommand(contents);
}

export default defineCheck({
  id: "install-documented",
  title: "Installation documented",
  category: "docs",
  weight: 4,
  why: "Documented installation steps let an agent set up the repository reliably.",
  async run(ctx) {
    const readme = await findReadme(ctx);
    if (!readme) {
      return {
        status: "fail",
        detail: "No root README was found.",
        fix: "Add a README with an installation section and command.",
      };
    }
    const contents = (await ctx.read(readme)) ?? "";
    const hasHeading = setupHeading.test(contents);
    const hasCommand = hasInstallCommand(contents, readme);
    if (hasHeading && hasCommand) {
      return { status: "pass", detail: `${readme} documents installation.` };
    }
    if (hasHeading || hasCommand) {
      return {
        status: "warn",
        detail: `${readme} is missing an installation heading or runnable command.`,
        fix: "Add an installation section and a runnable package-manager command.",
      };
    }
    return {
      status: "fail",
      detail: `${readme} has no installation guidance.`,
      fix: "Add an installation section and a runnable package-manager command.",
    };
  },
  async fix(ctx) {
    if (await findReadme(ctx)) return [];
    const manager = await detectPackageManager(ctx);
    return [
      {
        path: "README.md",
        contents: `# Project\n\n## Getting started\n\n\`\`\`sh\n${installCommand(manager)}\n\`\`\`\n`,
      },
    ];
  },
});
