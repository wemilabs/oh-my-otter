import { defineCheck } from "@oh-my-otter/core";
import { detectPackageManager } from "../lib/package-manager";
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

function workflow(manager: string, scripts: string[]): string {
  const setup =
    manager === "pnpm"
      ? "      - uses: pnpm/action-setup@v4\n"
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
  return `name: CI\n\non: [push, pull_request]\n\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n${setup}      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: ${install}${checks ? `\n${checks}` : ""}\n`;
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
    return [
      {
        path: ".github/workflows/ci.yml",
        contents: workflow(
          manager,
          ["lint", "typecheck", "test", "build"].filter((name) =>
            Boolean(scripts[name]),
          ),
        ),
      },
    ];
  },
});
