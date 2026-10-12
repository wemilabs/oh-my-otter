import { readText } from "../../context";
import { isTestFile, summarizeList } from "../../lib/files";
import {
  countTestCases,
  importsModule,
  referencesIdentifier,
} from "../../lib/imports";
import { maskNonCode } from "../../lib/lexer";
import { checkScript, missingScript, withOutput } from "../../lib/scripts";
import { defineTask } from "../../task";
import { TaskPreconditionError } from "../../types";
import manifest from "./task.json";
import prompt from "./prompt.md";

function mentions(source: string, name: string): boolean {
  const escaped = name.replace(/[$]/g, "\\$");
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(
    maskNonCode(source),
  );
}

export default defineTask({
  manifest,
  prompt,
  scripts: ["test"],
  async prepare(ctx) {
    const file = ctx.params.file as string;
    const name = ctx.params.function as string;
    if (!ctx.hasScript("test")) {
      throw new TaskPreconditionError(missingScript("test"));
    }
    if (isTestFile(file)) {
      throw new TaskPreconditionError(
        `${file} is a test file; pass the source file that contains ${name}.`,
      );
    }
    const source = await readText(ctx, file);
    if (source === null)
      throw new TaskPreconditionError(`File not found: ${file}`);
    if (!mentions(source, name)) {
      throw new TaskPreconditionError(`${file} does not contain ${name}.`);
    }
    const baseline = await ctx.recordBaseline();
    const test = baseline?.test;
    if (test && (test.code !== 0 || test.timedOut)) {
      throw new TaskPreconditionError(
        withOutput(
          "Precondition not met: the test script must pass at the baseline, so new tests can be told apart from existing failures. Fix the failing tests or the environment first.",
          test,
        ),
      );
    }
    return {};
  },
  async verify(ctx) {
    const file = ctx.params.file as string;
    const name = ctx.params.function as string;
    const reasons: string[] = [];
    const changed = await ctx.changedFiles();
    const changedTests = changed.filter((entry) => isTestFile(entry.path));
    const tests = changedTests.filter((entry) => entry.status !== "deleted");
    const deletedTests = changedTests.filter(
      (entry) => entry.status === "deleted",
    );
    const nonTests = changed.filter((entry) => !isTestFile(entry.path));

    if (tests.length === 0) {
      return {
        outcome: "fail",
        reasons: ["No test files were added or changed."],
      };
    }
    reasons.push(
      `Test files added or changed: ${summarizeList(tests.map((entry) => entry.path))}.`,
    );

    let failed = false;
    const importing: string[] = [];
    const exercising: string[] = [];
    let casesBefore = 0;
    let casesAfter = 0;
    for (const entry of changedTests) {
      if (entry.status === "deleted") continue;
      const source = (await readText(ctx, entry.path)) ?? "";
      if (!importsModule(source, entry.path, file)) continue;
      importing.push(entry.path);
      if (
        !referencesIdentifier(source, name, {
          fromFile: entry.path,
          target: file,
        })
      ) {
        continue;
      }
      exercising.push(entry.path);
      casesAfter += countTestCases(source);
      if (entry.status !== "added") {
        casesBefore += countTestCases(
          (await ctx.readBaseline(entry.path)) ?? "",
        );
      }
    }
    if (importing.length === 0) {
      failed = true;
      reasons.push(
        `No changed test file imports ${file} (relative path, or an @/ or ~/ alias).`,
      );
    } else if (exercising.length === 0) {
      failed = true;
      reasons.push(
        `${summarizeList(importing)} import ${file} but never use ${name} in code (comments and strings don't count).`,
      );
    } else {
      reasons.push(
        `${name} is used in ${summarizeList(exercising)}, which imports ${file}.`,
      );
    }
    if (casesAfter > casesBefore) {
      reasons.push(
        `Test cases in changed test files: ${casesBefore} → ${casesAfter}.`,
      );
    } else {
      failed = true;
      reasons.push(
        `No new test cases: it()/test() calls in test files that use ${name} went ${casesBefore} → ${casesAfter}.`,
      );
    }

    let partial = false;
    if (nonTests.length > 0) {
      partial = true;
      reasons.push(
        `Non-test files changed: ${summarizeList(nonTests.map((entry) => entry.path))}.`,
      );
    }
    if (deletedTests.length > 0) {
      partial = true;
      reasons.push(
        `Test files deleted: ${summarizeList(deletedTests.map((entry) => entry.path))}.`,
      );
    }

    const test = await checkScript(ctx, "test", { target: true });
    reasons.push(test.result === null ? "No test script." : test.reason);
    if (test.result === null || test.counted) failed = true;
    return {
      outcome: failed ? "fail" : partial ? "partial" : "pass",
      reasons,
    };
  },
});
