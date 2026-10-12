import { defineCheck } from "@oh-my-otter/core";
import { detectPackageManager } from "../lib/package-manager";
import { DEFAULT_NODE_MAJOR } from "../lib/node-version";
import { packageScripts } from "../lib/scripts";

const ciPatterns = [
  ".github/workflows/*.{yml,yaml}",
  ".gitlab-ci.yml",
  ".circleci/config.yml",
  "azure-pipelines.yml",
  "bitbucket-pipelines.yml",
  ".travis.yml",
  "Jenkinsfile",
  ".buildkite/*",
  ".woodpecker.yml",
  ".woodpecker/*",
  ".drone.yml",
];

function workflow(
  manager: string,
  scripts: string[],
  hasDeclaredPackageManager: boolean,
  nodeVersionFile: string | undefined,
): string {
  const setup =
    manager === "pnpm"
      ? `      - uses: pnpm/action-setup@v6\n${
          hasDeclaredPackageManager
            ? ""
            : "        with:\n          version: 12\n"
        }`
      : manager === "bun"
        ? "      - uses: oven-sh/setup-bun@v2\n"
        : "";
  const install =
    manager === "pnpm"
      ? "pnpm install --frozen-lockfile"
      : manager === "bun"
        ? "bun install --frozen-lockfile"
        : manager === "yarn"
          ? "yarn install --frozen-lockfile"
          : "npm ci";
  const managerCmd =
    manager === "npm"
      ? "npm run"
      : manager === "yarn"
        ? "yarn run"
        : `${manager} run`;
  const checks = scripts
    .map((script) => `      - run: ${managerCmd} ${script}`)
    .join("\n");
  const nodeVersion =
    nodeVersionFile === undefined
      ? `          node-version: ${DEFAULT_NODE_MAJOR}\n`
      : `          node-version-file: ${nodeVersionFile}\n`;
  return `name: CI\n\non: [push, pull_request]\n\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v7\n${setup}      - uses: actions/setup-node@v7\n        with:\n${nodeVersion}      - run: ${install}${checks ? `\n${checks}` : ""}\n`;
}

export default defineCheck({
  id: "ci-config",
  title: "Continuous integration config",
  category: "hygiene",
  weight: 3,
  why: "Continuous integration gives an agent a repeatable way to verify repository changes.",
  async run(ctx) {
    for (const pattern of ciPatterns) {
      if ((await ctx.glob(pattern)).length > 0) {
        return {
          status: "pass",
          detail: "A supported CI configuration was found.",
        };
      }
    }
    return {
      status: "fail",
      detail: "No supported CI configuration was found.",
      fix: "Add a CI workflow that installs dependencies and runs available quality scripts.",
    };
  },
  async fix(ctx) {
    const manager = await detectPackageManager(ctx);
    const scripts = packageScripts(ctx);
    const hasDeclaredPackageManager =
      typeof ctx.packageJson?.packageManager === "string" &&
      ctx.packageJson.packageManager.length > 0;
    const nodeVersionFile = (await ctx.exists(".nvmrc"))
      ? ".nvmrc"
      : (await ctx.exists(".node-version"))
        ? ".node-version"
        : undefined;
    return [
      {
        path: ".github/workflows/ci.yml",
        contents: workflow(
          manager,
          ["lint", "typecheck", "test", "build"].filter((name) =>
            Boolean(scripts[name]),
          ),
          hasDeclaredPackageManager,
          nodeVersionFile,
        ),
      },
    ];
  },
});
