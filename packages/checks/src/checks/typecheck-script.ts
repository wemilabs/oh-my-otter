import { defineCheck } from "@oh-my-otter/core";
import { packageScripts } from "../lib/scripts";
import { isTypeScriptRepo } from "../lib/typescript";

export default defineCheck({
  id: "typecheck-script",
  title: "Typecheck script",
  category: "verification",
  weight: 3,
  why: "Type checking catches errors that tests may not cover.",
  async run(ctx) {
    if (!(await isTypeScriptRepo(ctx))) {
      return {
        status: "na",
        detail: "This repository does not appear to use TypeScript.",
      };
    }
    const scripts = packageScripts(ctx);
    const expected = [
      "typecheck",
      "type-check",
      "check-types",
      "types:check",
      "tsc",
    ];
    if (
      expected.some((name) => Boolean(scripts[name])) ||
      Object.values(scripts).some((script) =>
        /\btsc\b[^&|;]*--noEmit/.test(script),
      )
    ) {
      return { status: "pass", detail: "A typecheck command is configured." };
    }
    return {
      status: "fail",
      detail: "No TypeScript checking script was found.",
      fix: "Add a typecheck script or a tsc --noEmit command.",
    };
  },
});
