import { defineCheck, type CheckContext } from "@oh-my-otter/core";

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
  "VERCEL",
  "NEXT_RUNTIME",
]);
const platformInjectedPrefixes = [
  "VERCEL_",
  "GITHUB_",
  "RUNNER_",
  "NETLIFY",
  "npm_",
];
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
    if (bareEnvPattern.test(bareSearchContents)) hasUsage = true;
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
    for (const file of envFiles) {
      if (await ctx.exists(file)) {
        const documented = documentedVariables((await ctx.read(file)) ?? "");
        const missing = [...names]
          .filter((name) => !documented.has(name))
          .sort();
        if (missing.length > 0) {
          const listed = missing.slice(0, 10).join(", ");
          const additional = missing.length - 10;
          return {
            status: "warn",
            detail: `${file} is missing: ${listed}${
              additional > 0 ? `, and ${additional} more` : ""
            }`,
            fix: `Add the missing variable names to ${file}.`,
          };
        }
        return {
          status: "pass",
          detail: `Found ${file} for environment variables.`,
        };
      }
    }
    return {
      status: "fail",
      detail: "Environment variables are used but no example file was found.",
      fix: "Add an .env.example file documenting the required variable names.",
    };
  },
  async fix(ctx) {
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
