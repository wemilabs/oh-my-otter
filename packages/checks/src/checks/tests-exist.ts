import { defineCheck } from "@oh-my-otter/core";

const ignoredDirectories = new Set([
  "dist",
  "build",
  ".next",
  "coverage",
  "out",
]);
const patterns = [
  "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  "**/__tests__/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  "{test,tests}/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
];

export default defineCheck({
  id: "tests-exist",
  title: "Test files exist",
  category: "verification",
  weight: 4,
  why: "Existing tests give an agent a safety net for changes.",
  async run(ctx) {
    const files = (
      await Promise.all(patterns.map((pattern) => ctx.glob(pattern)))
    ).flat();
    const found = files.find(
      (file) => !file.split("/").some((part) => ignoredDirectories.has(part)),
    );
    return found
      ? { status: "pass", detail: `Found test file ${found}.` }
      : {
          status: "fail",
          detail: "No test files matching common patterns were found.",
          fix: "Add a test file using a common .test or .spec filename.",
        };
  },
});
