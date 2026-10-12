import { defineCheck } from "@oh-my-otter/core";

const sourcePattern = "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,vue,svelte,astro}";
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
  if (ignoredVariables.has(name)) return false;
  names.add(name);
  return true;
}

export default defineCheck({
  id: "env-example",
  title: "Environment variable example",
  category: "setup",
  weight: 3,
  why: "An environment example tells an agent which local configuration values the project needs.",
  async run(ctx) {
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
      const patterns = [
        /process\s*\.\s*env\s*\.\s*([A-Za-z_][\w]*)/g,
        /process\s*\.\s*env\s*\[\s*(['"])([A-Za-z_][\w]*)\1\s*\]/g,
        /import\s*\.\s*meta\s*\.\s*env\s*\.\s*([A-Za-z_][\w]*)/g,
        /import\s*\.\s*meta\s*\.\s*env\s*\[\s*(['"])([A-Za-z_][\w]*)\1\s*\]/g,
      ];
      for (const pattern of patterns) {
        for (const match of contents.matchAll(pattern)) {
          const name = match[2] ?? match[1];
          if (name) hasUsage = addVariable(name, names) || hasUsage;
        }
      }
      if (/process\s*\.\s*env\s*\[\s*(?!["'])[^)\]]+\]/.test(contents)) {
        hasUsage = true;
      }
    }

    if (!hasUsage) {
      return {
        status: "na",
        detail: "No environment variable usage was found.",
      };
    }
    for (const file of envFiles) {
      if (await ctx.exists(file)) {
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
    const names = new Set<string>();
    const files = (await ctx.glob(sourcePattern))
      .filter(
        (file) => !file.split("/").some((part) => ignoredDirectories.has(part)),
      )
      .slice(0, 5000);
    for (const file of files) {
      const contents = await ctx.read(file);
      if (contents === null || Buffer.byteLength(contents, "utf8") > 1_000_000)
        continue;
      const patterns = [
        /process\s*\.\s*env\s*\.\s*([A-Za-z_][\w]*)/g,
        /process\s*\.\s*env\s*\[\s*(['"])([A-Za-z_][\w]*)\1\s*\]/g,
        /import\s*\.\s*meta\s*\.\s*env\s*\.\s*([A-Za-z_][\w]*)/g,
        /import\s*\.\s*meta\s*\.\s*env\s*\[\s*(['"])([A-Za-z_][\w]*)\1\s*\]/g,
      ];
      for (const pattern of patterns) {
        for (const match of contents.matchAll(pattern)) {
          const name = match[2] ?? match[1];
          if (name) addVariable(name, names);
        }
      }
    }
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
