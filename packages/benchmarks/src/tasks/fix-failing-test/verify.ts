import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { z } from "zod";
import { readText, resolveInside, runGit } from "../../context";
import { isTestFile, summarizeList } from "../../lib/files";
import { applyMutation, findMutations } from "../../lib/mutations";
import {
  changedScripts,
  checkScript,
  missingScript,
  scriptChangeReason,
  withOutput,
} from "../../lib/scripts";
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
  original_commit: z.string().optional(),
  mutation: z.string(),
  line: z.number().int().min(1).optional(),
});
type Data = z.infer<typeof dataSchema>;

const skipPattern =
  /\b(?:describe|it|test|suite|context|bench)\s*\.\s*(?:skip|todo|only|skipIf|runIf)\b|\b(?:xit|xtest|xdescribe|fit|fdescribe)\s*\(|\bskip\s*:\s*true\b/g;

export function countSkips(source: string): number {
  return [...source.matchAll(skipPattern)].length;
}

const BASELINE_MESSAGE = "bench baseline";
const neutralIdentity = [
  "-c",
  "user.name=bench",
  "-c",
  "user.email=bench@localhost.invalid",
  "-c",
  "commit.gpgsign=false",
];

async function gitWithEnv(
  root: string,
  args: readonly string[],
  env: Record<string, string>,
): Promise<string> {
  const result = await execa("git", ["-c", "core.quotepath=false", ...args], {
    cwd: root,
    reject: false,
    stdin: "ignore",
    env: { GIT_OPTIONAL_LOCKS: "0", ...env },
  });
  if (result.exitCode !== 0) {
    const detail = String(result.stderr || result.stdout).trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return String(result.stdout).trim();
}

/**
 * Writes HEAD's tree with the working-tree copy of `file` swapped in, as a
 * parentless commit with a neutral message, so the history holds no diff
 * that reveals the change. Uses a temporary index; the real index is untouched.
 */
async function snapshotCommit(root: string, file: string): Promise<string> {
  const indexPath = path.resolve(
    root,
    (
      await runGit(root, ["rev-parse", "--git-path", "omot-bench-index"])
    ).trim(),
  );
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    await gitWithEnv(root, ["read-tree", "HEAD"], env);
    await gitWithEnv(root, ["add", "--", file], env);
    const tree = await gitWithEnv(root, ["write-tree"], env);
    return await gitWithEnv(
      root,
      [...neutralIdentity, "commit-tree", tree, "-m", BASELINE_MESSAGE],
      {
        ...env,
        GIT_AUTHOR_NAME: "bench",
        GIT_AUTHOR_EMAIL: "bench@localhost.invalid",
        GIT_COMMITTER_NAME: "bench",
        GIT_COMMITTER_EMAIL: "bench@localhost.invalid",
      },
    );
  } finally {
    await rm(indexPath, { force: true });
  }
}

function lineAt(source: string, line: number): string {
  return source.split("\n")[line - 1] ?? "";
}

export default defineTask<Data>({
  manifest,
  prompt,
  scripts: ["test"],
  async prepare(ctx) {
    const file = ctx.params.file as string;
    if (isTestFile(file)) {
      throw new TaskPreconditionError(
        `${file} is a test file; pass a source file that the tests cover.`,
      );
    }
    if (!ctx.hasScript("test")) {
      throw new TaskPreconditionError(missingScript("test"));
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
      `fix-failing-test will flip one operator in ${file}, commit the result as a single parentless "${BASELINE_MESSAGE}" commit ` +
      `on the new branch ${branch}, and switch you to that branch. The commits on ${original} are not changed. Continue?`;
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

    const recorded = await ctx.recordBaseline();
    let baseline = recorded?.test ?? null;
    if (recorded === null) {
      ctx.log("Checking that the test suite passes at the baseline...");
      baseline = await ctx.runScript("test");
    }
    if (baseline === null || baseline.code !== 0 || baseline.timedOut) {
      throw new TaskPreconditionError(
        baseline === null
          ? missingScript("test")
          : withOutput(
              "Precondition not met: the test script must pass at the baseline before omot introduces a bug.",
              baseline,
            ),
      );
    }

    const originalCommit = (await ctx.git(["rev-parse", "HEAD"])).trim();
    const absolute = await resolveInside(ctx.root, file);
    try {
      for (const mutation of candidates) {
        await writeFile(absolute, applyMutation(source, mutation));
        const result = await ctx.runScript("test");
        if (result === null || result.code === 0) continue;
        const commit = await snapshotCommit(ctx.root, file);
        await writeFile(absolute, source);
        await ctx.git(["switch", "--quiet", "-c", branch, commit]);
        const described = `line ${mutation.line}: ${mutation.from} → ${mutation.to}`;
        ctx.log(
          `You are now on ${branch}; give your coding agent this branch. Its only commit, "${BASELINE_MESSAGE}", has no parent, so its history shows no diff. ${original} is unchanged; switch back with "git switch ${original}" when you are done.`,
        );
        return {
          file,
          branch,
          original_branch: original,
          original_commit: originalCommit,
          mutation: described,
          line: mutation.line,
        };
      }
    } catch (error) {
      await writeFile(absolute, source).catch(() => {});
      throw error;
    }
    await writeFile(absolute, source);
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
    const test = await checkScript(ctx, "test", { target: true });
    if (test.result === null || test.counted) failed = true;
    reasons.push(test.result === null ? "No test script." : test.reason);
    const current = await readText(ctx, data.file);
    const mutated = (await ctx.readBaseline(data.file)) ?? "";
    const original = data.original_commit
      ? await runGit(ctx.root, [
          "show",
          `${data.original_commit}:${data.file}`,
        ]).catch(() => null)
      : null;
    if (current === null) {
      reasons.push(
        `${data.file} was deleted (introduced bug: ${data.mutation}).`,
      );
    } else if (current === mutated.replace(/\r\n/g, "\n")) {
      reasons.push(`${data.file} unchanged; the fix is elsewhere.`);
    } else if (
      original !== null &&
      current === original.replace(/\r\n/g, "\n")
    ) {
      reasons.push(`${data.file}: bug reverted exactly (${data.mutation}).`);
    } else if (
      original !== null &&
      data.line !== undefined &&
      lineAt(current, data.line) ===
        lineAt(original.replace(/\r\n/g, "\n"), data.line)
    ) {
      reasons.push(
        `${data.file} changed: the mutated line is restored, with other edits too (${data.mutation}).`,
      );
    } else {
      reasons.push(
        `${data.file} changed, but the mutated line still differs from the original (${data.mutation}).`,
      );
    }
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
