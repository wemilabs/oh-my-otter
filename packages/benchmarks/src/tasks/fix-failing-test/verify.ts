import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { commandFailure, readText, resolveInside } from "../../context";
import { isTestFile, summarizeList } from "../../lib/files";
import { applyMutation, findMutations } from "../../lib/mutations";
import { changedScripts, scriptChangeReason } from "../../lib/scripts";
import { defineTask } from "../../task";
import { TaskPreconditionError } from "../../types";
import manifest from "./task.json";
import prompt from "./prompt.md";

const MAX_ATTEMPTS = 10;
const BRANCH_PREFIX = "omot/fix-failing-test-";

const dataSchema = z.object({
  file: z.string(),
  branch: z.string(),
  original_branch: z.string(),
  mutation: z.string(),
});
type Data = z.infer<typeof dataSchema>;

const skipPattern =
  /\b(?:describe|it|test|suite|context|bench)\s*\.\s*(?:skip|todo|only|skipIf|runIf)\b|\b(?:xit|xtest|xdescribe|fit|fdescribe)\s*\(|\bskip\s*:\s*true\b/g;

export function countSkips(source: string): number {
  return [...source.matchAll(skipPattern)].length;
}

const commitArgs = [
  "-c",
  "user.name=Oh My Otter",
  "-c",
  "user.email=omot@localhost.invalid",
  "-c",
  "commit.gpgsign=false",
  "commit",
  "--no-verify",
  "--quiet",
  "-m",
  "omot bench: introduce a failing test (fix-failing-test)",
];

export default defineTask<Data>({
  manifest,
  prompt,
  async prepare(ctx) {
    const file = ctx.params.file as string;
    if (isTestFile(file)) {
      throw new TaskPreconditionError(
        `${file} is a test file; pass a source file that the tests cover.`,
      );
    }
    if (!ctx.hasScript("test")) {
      throw new TaskPreconditionError("No test script (scripts.test) found.");
    }
    const source = await readText(ctx, file);
    if (source === null)
      throw new TaskPreconditionError(`File not found: ${file}`);
    const status = (
      await ctx.git(["status", "--porcelain", "--untracked-files=all"])
    )
      .split("\n")
      .filter((line) => line.trim() && !line.slice(3).startsWith(".omot/"));
    if (status.length > 0) {
      throw new TaskPreconditionError(
        "The working tree has uncommitted changes; commit or stash them first.",
      );
    }
    const candidates = findMutations(source).slice(0, MAX_ATTEMPTS);
    if (candidates.length === 0) {
      throw new TaskPreconditionError(
        `No operator in ${file} that omot can flip.`,
      );
    }
    const original = (
      await ctx.git(["rev-parse", "--abbrev-ref", "HEAD"])
    ).trim();
    const branch = `${BRANCH_PREFIX}${Math.floor(Date.now() / 1000)}`;
    const question =
      `fix-failing-test will create the throwaway branch ${branch}, flip one operator in ${file}, ` +
      `and commit it there so the tests fail. Your current branch (${original}) is not changed. Continue?`;
    if (!ctx.yes) {
      if (!ctx.isTTY) {
        throw new TaskPreconditionError(
          `${question.replace(/ Continue\?$/, "")} Re-run with --yes to confirm.`,
        );
      }
      if (!(await ctx.confirm(question))) {
        throw new TaskPreconditionError("Cancelled; nothing was changed.");
      }
    }

    ctx.log("Checking that the test suite passes at the baseline...");
    const baseline = await ctx.runScript("test");
    if (baseline === null || baseline.code !== 0) {
      throw new TaskPreconditionError(
        baseline === null
          ? "No test script."
          : `The test suite must pass first. ${commandFailure("test script", baseline)}`,
      );
    }

    const absolute = await resolveInside(ctx.root, file);
    await ctx.git(["switch", "--quiet", "-c", branch]);
    const restore = async () => {
      await writeFile(absolute, source);
      await ctx.git(["switch", "--quiet", original]);
      await ctx.git(["branch", "--quiet", "-D", branch]);
    };
    try {
      for (const mutation of candidates) {
        await writeFile(absolute, applyMutation(source, mutation));
        const result = await ctx.runScript("test");
        if (result !== null && result.code !== 0) {
          await ctx.git([...commitArgs, "--", file]);
          const described = `line ${mutation.line}: ${mutation.from} → ${mutation.to}`;
          ctx.log(
            `Introduced a failing test on ${branch} (${file}, ${described}).`,
          );
          return {
            file,
            branch,
            original_branch: original,
            mutation: described,
          };
        }
      }
    } catch (error) {
      await restore().catch(() => {});
      throw error;
    }
    await restore();
    throw new TaskPreconditionError(
      `None of the first ${candidates.length} operator flips in ${file} made a test fail; pick a file with stronger test coverage.`,
    );
  },
  async verify(ctx) {
    const data = dataSchema.parse(ctx.baseline.data);
    const reasons: string[] = [];
    const changed = await ctx.changedFiles();
    const tests = changed.filter((file) => isTestFile(file.path));
    const deleted = tests.filter((file) => file.status === "deleted");
    const modified = tests.filter((file) => file.status !== "deleted");
    let failed = false;
    if (deleted.length > 0) {
      failed = true;
      reasons.push(
        `Test files deleted: ${summarizeList(deleted.map((file) => file.path))}.`,
      );
    }
    let skipsAdded = 0;
    for (const file of modified) {
      const after = (await ctx.read(file.path)) ?? "";
      const before =
        file.status === "added"
          ? ""
          : ((await ctx.readBaseline(file.path)) ?? "");
      skipsAdded += Math.max(0, countSkips(after) - countSkips(before));
    }
    if (skipsAdded > 0) {
      failed = true;
      reasons.push(`${skipsAdded} test(s) skipped, focused, or marked todo.`);
    }
    const scripts = await changedScripts(ctx, ["test"]);
    if (scripts.length > 0) {
      failed = true;
      reasons.push(scriptChangeReason(scripts));
    }
    const result = await ctx.runScript("test");
    if (result === null || result.code !== 0) {
      failed = true;
      reasons.push(
        result === null
          ? "No test script."
          : commandFailure("test script", result),
      );
    } else {
      reasons.push("test script passed.");
    }
    const restored = changed.some((file) => file.path === data.file);
    reasons.push(
      restored
        ? `${data.file} changed (introduced bug: ${data.mutation}).`
        : `${data.file} unchanged; the fix is elsewhere.`,
    );
    if (failed) return { outcome: "fail", reasons };
    if (modified.length > 0) {
      reasons.push(
        `Test files modified: ${summarizeList(modified.map((file) => file.path))}.`,
      );
      return { outcome: "partial", reasons };
    }
    return { outcome: "pass", reasons };
  },
});
