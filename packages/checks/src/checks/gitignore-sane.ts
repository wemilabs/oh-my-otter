import { defineCheck } from "@oh-my-otter/core";

const buildOutputs = [
  "dist",
  "build",
  ".next",
  "out",
  ".output",
  ".turbo",
  ".svelte-kit",
  ".nuxt",
];

interface IgnoreRule {
  pattern: string;
  negated: boolean;
}

function ignoreRules(contents: string): IgnoreRule[] {
  return contents
    .split(/\r?\n/)
    .map((line) => line.split("#", 1)[0]?.trim() ?? "")
    .filter(Boolean)
    .map((line) => {
      const negated = line.startsWith("!");
      return {
        pattern: negated ? line.slice(1).trim() : line,
        negated,
      };
    });
}

function matchesName(pattern: string, name: string): boolean {
  return pattern
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .split("/")
    .some((part) => part === name);
}

function unignoresName(pattern: string, name: string): boolean {
  return (
    pattern
      .replace(/^\//, "")
      .replace(/^\*\*\//, "")
      .replace(/\/$/, "") === name
  );
}

function ignoresName(rules: IgnoreRule[], name: string): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (
      rule.negated
        ? unignoresName(rule.pattern, name)
        : matchesName(rule.pattern, name)
    ) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

export default defineCheck({
  id: "gitignore-sane",
  title: "Useful .gitignore",
  category: "hygiene",
  weight: 2,
  why: "Ignoring dependencies and generated outputs keeps agent changes focused on source files.",
  async run(ctx) {
    const contents = await ctx.read(".gitignore");
    if (contents === null) {
      return {
        status: "fail",
        detail: ".gitignore is missing.",
        fix: "Add a .gitignore for dependencies, build outputs, and local environment files.",
      };
    }
    const rules = ignoreRules(contents);
    const hasNodeModules = ignoresName(rules, "node_modules");
    const output = buildOutputs.find((name) => ignoresName(rules, name));
    if (hasNodeModules && output) {
      return {
        status: "pass",
        detail: `.gitignore excludes node_modules and ${output}.`,
      };
    }
    return {
      status: "warn",
      detail: `Existing .gitignore is missing ${!hasNodeModules ? "node_modules" : "a build output"} ignore.`,
      fix: "Add node_modules and a build-output directory to .gitignore.",
    };
  },
  async fix(ctx) {
    if (await ctx.exists(".gitignore")) return [];
    return [
      {
        path: ".gitignore",
        contents: "node_modules\ndist\nbuild\ncoverage\n.env\n.env.local\n",
      },
    ];
  },
});
