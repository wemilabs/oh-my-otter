import { defineCheck } from "@oh-my-otter/core";
import { hasUsableTestScript, packageScripts } from "../lib/scripts";

export default defineCheck({
  id: "test-script",
  title: "Test script",
  category: "verification",
  weight: 5,
  why: "A test script gives an agent a reliable way to validate code changes.",
  async run(ctx) {
    if (hasUsableTestScript(ctx)) {
      return {
        status: "pass",
        detail: "A usable scripts.test command is configured.",
      };
    }
    const scripts = packageScripts(ctx);
    const testScripts = Object.keys(scripts).filter((name) =>
      /^test[:_-]/.test(name),
    );
    if (testScripts.length > 0) {
      const first = testScripts[0]!;
      const prefix = scripts.test
        ? "No usable scripts.test"
        : "No scripts.test";
      return {
        status: "warn",
        detail: `${prefix}, but found ${testScripts.join(", ")}; agents and CI usually run the test script.`,
        fix: `Add a "test" script that runs them, for example "test": "npm run ${first}".`,
      };
    }
    return {
      status: "fail",
      detail: "No usable scripts.test command was found.",
      fix: "Add a test script that runs the repository's test suite.",
    };
  },
});
