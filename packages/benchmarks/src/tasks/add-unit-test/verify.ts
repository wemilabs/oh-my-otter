import { createHash } from "node:crypto";
import { open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readText, resolveInside } from "../../context";
import { isTestFile, summarizeList } from "../../lib/files";
import { findFunctionBody } from "../../lib/functions";
import {
  countTargetTestCases,
  importsModule,
  referencesIdentifier,
} from "../../lib/imports";
import { maskNonCode } from "../../lib/lexer";
import { applyMutation, findMutations } from "../../lib/mutations";
import { checkScript, missingScript, withOutput } from "../../lib/scripts";
import { defineTask } from "../../task";
import { TaskPreconditionError } from "../../types";
import type { VerifyContext } from "../../types";
import manifest from "./task.json";
import prompt from "./prompt.md";

const MAX_MUTANTS = 3;
const MUTATION_LOCK_TIMEOUT_MS = 60 * 60_000;

async function removeStaleMutationLock(lockPath: string): Promise<boolean> {
  let owner: number;
  try {
    owner = Number((await readFile(lockPath, "utf8")).trim());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
  if (!Number.isSafeInteger(owner) || owner <= 0) return false;
  try {
    process.kill(owner, 0);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") return false;
    await rm(lockPath, { force: true });
    return true;
  }
}

async function withMutationLock<T>(
  root: string,
  action: () => Promise<T>,
): Promise<T> {
  const lockPath = path.join(
    tmpdir(),
    `omot-mutation-${createHash("sha256").update(path.resolve(root)).digest("hex")}.lock`,
  );
  const started = Date.now();
  while (true) {
    let lock;
    try {
      lock = await open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await removeStaleMutationLock(lockPath)) continue;
      if (Date.now() - started >= MUTATION_LOCK_TIMEOUT_MS) {
        throw new Error("Timed out waiting for the unit-test mutation lock.", {
          cause: error,
        });
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
      continue;
    }
    try {
      await lock.writeFile(`${process.pid}\n`);
      return await action();
    } finally {
      try {
        await lock.close();
      } finally {
        await rm(lockPath, { force: true });
      }
    }
  }
}

function lockVerifier<TContext extends { root: string }, TResult>(
  verify: (ctx: TContext) => Promise<TResult>,
): (ctx: TContext) => Promise<TResult> {
  return (ctx) => withMutationLock(ctx.root, () => verify(ctx));
}

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
  verify: lockVerifier(async (ctx: VerifyContext) => {
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
      const scope = { fromFile: entry.path, target: file };
      casesAfter += countTargetTestCases(source, name, scope);
      if (entry.status !== "added") {
        casesBefore += countTargetTestCases(
          (await ctx.readBaseline(entry.path)) ?? "",
          name,
          scope,
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
        `Test cases that use ${name} in changed test files: ${casesBefore} → ${casesAfter}.`,
      );
    } else {
      failed = true;
      reasons.push(
        `No new test cases that use ${name}: changed test files went ${casesBefore} → ${casesAfter}.`,
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
    if (!failed) {
      const absolute = await resolveInside(ctx.root, file);
      const original = await readFile(absolute);
      const source = original.toString("utf8");
      const body = findFunctionBody(source, name);
      const mutations = body
        ? findMutations(source)
            .filter(
              (mutation) =>
                mutation.index >= body.start && mutation.index < body.end,
            )
            .slice(0, MAX_MUTANTS)
        : [];
      if (mutations.length === 0) {
        reasons.push(
          `Mutation check skipped: no operator in ${name} that omot can flip.`,
        );
      } else {
        ctx.log(
          `Mutation check: running the tests against ${mutations.length} injected bugs in ${name}...`,
        );
        let caught = 0;
        for (const mutation of mutations) {
          try {
            await writeFile(absolute, applyMutation(source, mutation));
            const result = await ctx.runScript("test");
            if (result !== null && (result.code !== 0 || result.timedOut)) {
              caught += 1;
            }
          } finally {
            await writeFile(absolute, original);
          }
        }
        const descriptions = mutations
          .map(
            (mutation) =>
              `line ${mutation.line}: ${mutation.from} → ${mutation.to}`,
          )
          .join(", ");
        reasons.push(
          `Mutation check: the tests caught ${caught} of ${mutations.length} injected bugs in ${name} (${descriptions}).`,
        );
        if (caught === 0) {
          reasons.push(
            `The new tests pass but caught none of ${mutations.length} injected bugs in ${name}.`,
          );
          partial = true;
        }
      }
    }
    return {
      outcome: failed ? "fail" : partial ? "partial" : "pass",
      reasons,
    };
  }),
});
