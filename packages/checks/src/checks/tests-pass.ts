import { defineCheck, isRunDisabledError } from "@oh-my-otter/core";
import { detectPackageManager, testCommand } from "../lib/package-manager";
import { hasUsableTestScript } from "../lib/scripts";

export default defineCheck({
  id: "tests-pass",
  title: "Tests pass",
  category: "verification",
  weight: 5,
  why: "Passing tests help an agent avoid introducing regressions.",
  async run(ctx) {
    if (!hasUsableTestScript(ctx)) {
      return { status: "na", detail: "No usable test script is configured." };
    }
    try {
      const manager = await detectPackageManager(ctx);
      const { code } = await ctx.run(testCommand(manager), {
        timeoutMs: 300_000,
      });
      return code === 0
        ? { status: "pass", detail: "The test script passed." }
        : {
            status: "fail",
            detail: `The test script exited with code ${code}.`,
            fix: "Fix the test failures so the test script exits successfully.",
          };
    } catch (error) {
      if (isRunDisabledError(error)) {
        return {
          status: "na",
          detail: "pass --run to execute the test script",
        };
      }
      return {
        status: "fail",
        detail: `The test script could not run: ${error instanceof Error ? error.message : String(error)}.`,
        fix: "Fix the test script so it can run successfully.",
      };
    }
  },
});
