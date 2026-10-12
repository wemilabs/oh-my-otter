import { commandFailure, readText } from "../../context";
import { isTestFile, summarizeList } from "../../lib/files";
import { defineTask } from "../../task";
import { TaskPreconditionError } from "../../types";
import manifest from "./task.json";
import prompt from "./prompt.md";

function mentions(source: string, name: string): boolean {
  const escaped = name.replace(/[$]/g, "\\$");
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(source);
}

export default defineTask({
  manifest,
  prompt,
  async prepare(ctx) {
    const file = ctx.params.file as string;
    const name = ctx.params.function as string;
    if (!ctx.hasScript("test")) {
      throw new TaskPreconditionError("No test script (scripts.test) found.");
    }
    const source = await readText(ctx, file);
    if (source === null)
      throw new TaskPreconditionError(`File not found: ${file}`);
    if (!mentions(source, name)) {
      throw new TaskPreconditionError(`${file} does not contain ${name}.`);
    }
    return {};
  },
  async verify(ctx) {
    const name = ctx.params.function as string;
    const reasons: string[] = [];
    const changed = await ctx.changedFiles();
    const tests = changed.filter(
      (file) => isTestFile(file.path) && file.status !== "deleted",
    );
    const deletedTests = changed.filter(
      (file) => isTestFile(file.path) && file.status === "deleted",
    );
    const nonTests = changed.filter((file) => !isTestFile(file.path));

    if (tests.length === 0) {
      return {
        outcome: "fail",
        reasons: ["No test files were added or changed."],
      };
    }
    reasons.push(
      `Test files added or changed: ${summarizeList(tests.map((file) => file.path))}.`,
    );

    let referenced = false;
    for (const file of tests) {
      const source = await readText(ctx, file.path);
      if (source !== null && mentions(source, name)) referenced = true;
    }
    let partial = false;
    if (!referenced) {
      partial = true;
      reasons.push(`No changed test file references ${name}.`);
    }
    if (nonTests.length > 0) {
      partial = true;
      reasons.push(
        `Non-test files changed: ${summarizeList(nonTests.map((file) => file.path))}.`,
      );
    }
    if (deletedTests.length > 0) {
      partial = true;
      reasons.push(
        `Test files deleted: ${summarizeList(deletedTests.map((file) => file.path))}.`,
      );
    }

    const result = await ctx.runScript("test");
    if (result === null || result.code !== 0) {
      reasons.push(
        result === null
          ? "No test script."
          : commandFailure("test script", result),
      );
      return { outcome: "fail", reasons };
    }
    reasons.push("test script passed.");
    return { outcome: partial ? "partial" : "pass", reasons };
  },
});
