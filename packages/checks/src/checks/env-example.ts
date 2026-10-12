import { defineCheck, type CheckContext } from "@oh-my-otter/core";
import { isGitignored } from "../lib/gitignore";

const sourcePattern = "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,vue,svelte,astro}";
const envPatterns = [
  /process\s*\.\s*env\s*\.\s*([A-Za-z_][\w]*)/g,
  /process\s*\.\s*env\s*\[\s*(['"])([A-Za-z_][\w]*)\1\s*\]/g,
  /import\s*\.\s*meta\s*\.\s*env\s*\.\s*([A-Za-z_][\w]*)/g,
  /import\s*\.\s*meta\s*\.\s*env\s*\[\s*(['"])([A-Za-z_][\w]*)\1\s*\]/g,
];
const envDestructuringPatterns = [
  /\{([^{}]*)\}\s*=\s*process\s*\.\s*env\b/g,
  /\{([^{}]*)\}\s*=\s*import\s*\.\s*meta\s*\.\s*env\b/g,
];
const dynamicEnvPattern =
  /(?:process\s*\.\s*env|import\s*\.\s*meta\s*\.\s*env)\s*\[\s*(?!["'])[^)\]]+\]/;
const bareEnvPattern =
  /(?:process\s*\.\s*env|import\s*\.\s*meta\s*\.\s*env)\b(?!\s*(?:\.|\[))/;
const envExampleKeyPattern = /^\s*#?\s*(?:export\s+)?([A-Za-z_]\w*)\s*=/;
const schemaCallPattern =
  /\b(?:(?:z|v|t|[Jj]oi)\s*\.\s*object|createEnv)\s*\(/g;
const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
]);
const ignoredVariables = new Set([
  "NODE_ENV",
  "MODE",
  "DEV",
  "PROD",
  "SSR",
  "BASE_URL",
]);
const platformInjectedVariables = new Set([
  "CI",
  "HOME",
  "PATH",
  "PWD",
  "USER",
  "SHELL",
  "TERM",
  "TZ",
  "LANG",
  "NEXT_RUNTIME",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_REGION",
  "VERCEL_DEPLOYMENT_ID",
  "NETLIFY",
  "NETLIFY_DEV",
  "GITHUB_ACTIONS",
  "GITHUB_SHA",
  "GITHUB_REF",
  "GITHUB_REF_NAME",
  "GITHUB_HEAD_REF",
  "GITHUB_BASE_REF",
  "GITHUB_RUN_ID",
  "GITHUB_RUN_NUMBER",
  "GITHUB_WORKSPACE",
  "GITHUB_REPOSITORY",
  "GITHUB_EVENT_NAME",
  "GITHUB_SERVER_URL",
  "GITHUB_OUTPUT",
  "GITHUB_ENV",
  "GITHUB_STEP_SUMMARY",
]);
const platformInjectedPrefixes = ["VERCEL_GIT_", "RUNNER_", "npm_"];
const envFiles = [
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.dist",
  ".env.defaults",
  "example.env",
  ".env.local.example",
];

function addVariable(name: string, names: Set<string>): boolean {
  if (
    ignoredVariables.has(name) ||
    platformInjectedVariables.has(name) ||
    platformInjectedPrefixes.some((prefix) => name.startsWith(prefix))
  ) {
    return false;
  }
  names.add(name);
  return true;
}

function documentedVariables(contents: string): Set<string> {
  const names = new Set<string>();
  for (const line of contents.split(/\r?\n/)) {
    const name = envExampleKeyPattern.exec(line)?.[1];
    if (name) names.add(name);
  }
  return names;
}

function maskStringsAndComments(contents: string): string {
  const masked = contents.split("");
  const blank = (start: number, end: number) => {
    for (let index = start; index < end; index++) {
      if (masked[index] !== "\n" && masked[index] !== "\r") masked[index] = " ";
    }
  };

  const scanString = (start: number): number => {
    const quote = contents[start];
    let end = start + 1;
    while (end < contents.length) {
      if (contents[end] === "\\") {
        end += 2;
        continue;
      }
      if (contents[end] === quote) {
        end++;
        break;
      }
      end++;
    }
    blank(start, end);
    return end;
  };

  const regexAllowedPrevious = new Set("(,=:[!&|?{};+-*%>~^".split(""));
  const regexKeywords = new Set([
    "return",
    "typeof",
    "case",
    "do",
    "else",
    "in",
    "of",
    "new",
    "delete",
    "void",
    "throw",
    "instanceof",
    "yield",
    "await",
  ]);

  const scanRegex = (start: number): number | null => {
    let index = start + 1;
    let inClass = false;
    while (index < contents.length) {
      const char = contents[index];
      if (char === "\n") return null;
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (inClass) {
        if (char === "]") inClass = false;
        index++;
        continue;
      }
      if (char === "[") {
        inClass = true;
        index++;
        continue;
      }
      if (char === "/") {
        index++;
        while (index < contents.length && /[a-z]/.test(contents[index]!))
          index++;
        return index;
      }
      index++;
    }
    return null;
  };

  const scanCode = (start: number, untilCloseBrace: boolean): number => {
    let index = start;
    let depth = 0;
    let previous = "";
    let previousIndex = -1;
    const startsRegex = (): boolean => {
      if (previous === "") return true;
      if (previous === "}" && contents[index + 1] === ">") return false;
      if (regexAllowedPrevious.has(previous)) return true;
      if (previousIndex < 0 || !/[A-Za-z0-9_$]/.test(previous)) return false;
      let wordStart = previousIndex;
      while (wordStart > 0 && /[A-Za-z0-9_$]/.test(contents[wordStart - 1]!))
        wordStart--;
      return regexKeywords.has(contents.slice(wordStart, previousIndex + 1));
    };
    while (index < contents.length) {
      const char = contents[index]!;
      if (char === "'" || char === '"') {
        index = scanString(index);
        previous = "x";
        previousIndex = -1;
        continue;
      }
      if (char === "`") {
        index = scanTemplate(index);
        previous = "x";
        previousIndex = -1;
        continue;
      }
      if (char === "/" && contents[index + 1] === "/") {
        let end = index + 2;
        while (end < contents.length && contents[end] !== "\n") end++;
        blank(index, end);
        index = end;
        continue;
      }
      if (char === "/" && contents[index + 1] === "*") {
        const close = contents.indexOf("*/", index + 2);
        const end = close < 0 ? contents.length : close + 2;
        blank(index, end);
        index = end;
        continue;
      }
      if (char === "/" && startsRegex()) {
        const end = scanRegex(index);
        if (end !== null) {
          blank(index, end);
          index = end;
          previous = "x";
          previousIndex = -1;
          continue;
        }
      }
      if (char === "{") depth++;
      if (char === "}") {
        if (untilCloseBrace && depth === 0) return index;
        depth--;
      }
      if (!/\s/.test(char)) {
        previous = char;
        previousIndex = index;
      }
      index++;
    }
    return contents.length;
  };

  const scanTemplate = (start: number): number => {
    let literalStart = start;
    let index = start + 1;
    while (index < contents.length) {
      const char = contents[index];
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === "`") {
        blank(literalStart, index + 1);
        return index + 1;
      }
      if (char === "$" && contents[index + 1] === "{") {
        blank(literalStart, index + 2);
        const close = scanCode(index + 2, true);
        blank(close, close + 1);
        index = close + 1;
        literalStart = index;
        continue;
      }
      index++;
    }
    blank(literalStart, contents.length);
    return contents.length;
  };

  scanCode(0, false);
  return masked.join("");
}

function matchingBrace(contents: string, openIndex: number): number | null {
  if (contents[openIndex] !== "{") return null;
  let depth = 0;
  for (let index = openIndex; index < contents.length; index++) {
    if (contents[index] === "{") depth++;
    if (contents[index] === "}" && --depth === 0) return index;
  }
  return null;
}

function findTopLevelComma(
  contents: string,
  start: number,
  end: number,
): number {
  let braces = 0;
  let brackets = 0;
  let parentheses = 0;
  for (let index = start; index < end; index++) {
    const char = contents[index];
    if (char === "{") braces++;
    else if (char === "}") braces--;
    else if (char === "[") brackets++;
    else if (char === "]") brackets--;
    else if (char === "(") parentheses++;
    else if (char === ")") parentheses--;
    else if (
      char === "," &&
      braces === 0 &&
      brackets === 0 &&
      parentheses === 0
    )
      return index;
  }
  return end;
}

function objectProperties(
  contents: string,
  openIndex: number,
  closeIndex: number,
): Array<{ name: string; valueStart: number }> {
  const properties: Array<{ name: string; valueStart: number }> = [];
  let cursor = openIndex + 1;
  while (cursor < closeIndex) {
    while (cursor < closeIndex && /[\s,]/.test(contents[cursor] ?? ""))
      cursor++;
    if (cursor >= closeIndex) break;
    const key = /^[A-Za-z_$][\w$]*/.exec(contents.slice(cursor));
    if (!key) {
      const comma = findTopLevelComma(contents, cursor, closeIndex);
      cursor = comma < closeIndex ? comma + 1 : closeIndex;
      continue;
    }
    const name = key[0];
    cursor += name.length;
    while (cursor < closeIndex && /\s/.test(contents[cursor] ?? "")) cursor++;
    if (contents[cursor] !== ":") {
      const comma = findTopLevelComma(contents, cursor, closeIndex);
      cursor = comma < closeIndex ? comma + 1 : closeIndex;
      continue;
    }
    cursor++;
    while (cursor < closeIndex && /\s/.test(contents[cursor] ?? "")) cursor++;
    properties.push({ name, valueStart: cursor });
    const comma = findTopLevelComma(contents, cursor, closeIndex);
    cursor = comma < closeIndex ? comma + 1 : closeIndex;
  }
  return properties;
}

function addObjectKeys(
  contents: string,
  openIndex: number,
  closeIndex: number,
  names: Set<string>,
): void {
  for (const { name } of objectProperties(contents, openIndex, closeIndex)) {
    if (/^[A-Z][A-Z0-9_]*$/.test(name)) addVariable(name, names);
  }
}

function collectSchemaEnvKeys(contents: string, names: Set<string>): void {
  const code = maskStringsAndComments(contents);
  for (const match of code.matchAll(schemaCallPattern)) {
    const openParen = (match.index ?? 0) + match[0].lastIndexOf("(");
    let objectStart = openParen + 1;
    while (/\s/.test(code[objectStart] ?? "")) objectStart++;
    if (code[objectStart] === ")") {
      const keysCall = /^\s*\.\s*keys\s*\(\s*\{/.exec(
        code.slice(objectStart + 1),
      );
      if (!keysCall) continue;
      objectStart = objectStart + keysCall[0].length;
    }
    const objectEnd = matchingBrace(code, objectStart);
    if (objectEnd === null) continue;

    if (match[0].includes("createEnv")) {
      for (const property of objectProperties(code, objectStart, objectEnd)) {
        if (
          !["server", "client", "shared"].includes(property.name) ||
          code[property.valueStart] !== "{"
        ) {
          continue;
        }
        const nestedEnd = matchingBrace(code, property.valueStart);
        if (nestedEnd !== null) {
          addObjectKeys(code, property.valueStart, nestedEnd, names);
        }
      }
    } else {
      addObjectKeys(code, objectStart, objectEnd, names);
    }
  }
}

async function collectEnvUsage(
  ctx: CheckContext,
): Promise<{ names: Set<string>; hasUsage: boolean }> {
  const names = new Set<string>();
  let hasUsage = false;
  const files = (await ctx.glob(sourcePattern))
    .filter(
      (file) => !file.split("/").some((part) => ignoredDirectories.has(part)),
    )
    .slice(0, 5000);

  for (const file of files) {
    const contents = await ctx.read(file);
    if (contents === null || Buffer.byteLength(contents, "utf8") > 1_000_000)
      continue;
    let bareSearchContents = contents;
    for (const pattern of envDestructuringPatterns) {
      for (const match of contents.matchAll(pattern)) {
        for (const property of (match[1] ?? "").split(",")) {
          const trimmed = property.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith("...")) {
            hasUsage = true;
            continue;
          }
          const name = /^([A-Za-z_][\w]*)/.exec(trimmed)?.[1];
          if (name) hasUsage = addVariable(name, names) || hasUsage;
        }
      }
      bareSearchContents = bareSearchContents.replace(pattern, "");
    }
    for (const pattern of envPatterns) {
      for (const match of contents.matchAll(pattern)) {
        const name = match[2] ?? match[1];
        if (name) hasUsage = addVariable(name, names) || hasUsage;
      }
    }
    if (dynamicEnvPattern.test(contents)) hasUsage = true;
    if (bareEnvPattern.test(bareSearchContents)) {
      hasUsage = true;
      collectSchemaEnvKeys(contents, names);
    }
  }

  return { names, hasUsage };
}

export default defineCheck({
  id: "env-example",
  title: "Environment variable example",
  category: "setup",
  weight: 3,
  why: "An environment example tells an agent which local configuration values the project needs.",
  async run(ctx) {
    const { names, hasUsage } = await collectEnvUsage(ctx);
    if (!hasUsage) {
      return {
        status: "na",
        detail: "No environment variable usage was found.",
      };
    }
    const exampleFiles: Array<{
      file: string;
      ignored: boolean;
      contents: string;
    }> = [];
    for (const file of envFiles) {
      if (await ctx.exists(file)) {
        exampleFiles.push({
          file,
          ignored: await isGitignored(ctx, file),
          contents: (await ctx.read(file)) ?? "",
        });
      }
    }
    if (exampleFiles.length > 0) {
      const visibleFiles = exampleFiles.filter((example) => !example.ignored);
      const documentedFiles =
        visibleFiles.length > 0 ? visibleFiles : exampleFiles;
      const documented = new Set<string>();
      for (const example of documentedFiles) {
        for (const name of documentedVariables(example.contents)) {
          documented.add(name);
        }
      }
      const missing = [...names].filter((name) => !documented.has(name)).sort();
      const allIgnored = visibleFiles.length === 0;
      const firstDocumentedFile =
        documentedFiles[0]?.file ?? exampleFiles[0]!.file;
      const firstIgnoredFile =
        exampleFiles.find((example) => example.ignored)?.file ??
        firstDocumentedFile;
      if (missing.length > 0 || allIgnored) {
        const listed = missing.slice(0, 10).join(", ");
        const additional = missing.length - 10;
        const detail = [];
        const fix = [];
        if (missing.length > 0) {
          detail.push(
            `${firstDocumentedFile} is missing: ${listed}${
              additional > 0 ? `, and ${additional} more` : ""
            }`,
          );
          fix.push(`Add the missing variable names to ${firstDocumentedFile}.`);
        }
        if (allIgnored) {
          detail.push(`${firstIgnoredFile} is ignored by .gitignore`);
          fix.push(
            `Add !${firstIgnoredFile} to .gitignore so it can be committed.`,
          );
        }
        return {
          status: "warn",
          detail: detail.join("; "),
          fix: fix.join(" "),
        };
      }
      return {
        status: "pass",
        detail: `Found ${exampleFiles[0]} for environment variables.`,
      };
    }
    return {
      status: "fail",
      detail: "Environment variables are used but no example file was found.",
      fix: "Add an .env.example file documenting the required variable names.",
    };
  },
  async fix(ctx) {
    for (const file of envFiles) {
      if (await ctx.exists(file)) return [];
    }
    const { names } = await collectEnvUsage(ctx);
    return [
      {
        path: ".env.example",
        contents: [...names]
          .sort()
          .map((name) => `${name}=\n`)
          .join(""),
      },
    ];
  },
});
