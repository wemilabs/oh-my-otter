import { defineCheck } from "@oh-my-otter/core";
import { hasUsableTestScript } from "../lib/scripts";

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
    return {
      status: "fail",
      detail: "No usable scripts.test command was found.",
      fix: "Add a test script that runs the repository's test suite.",
    };
  },
});
