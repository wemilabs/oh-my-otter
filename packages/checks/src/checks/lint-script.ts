import { defineCheck } from "@oh-my-otter/core";
import { packageScripts } from "../lib/scripts";

export default defineCheck({
  id: "lint-script",
  title: "Lint script",
  category: "verification",
  weight: 3,
  why: "A lint command lets an agent detect common code-quality problems.",
  async run(ctx) {
    return packageScripts(ctx).lint
      ? { status: "pass", detail: "A scripts.lint command is configured." }
      : {
          status: "fail",
          detail: "No scripts.lint command was found.",
          fix: "Add a lint script to package.json.",
        };
  },
});
