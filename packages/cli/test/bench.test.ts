import {
  access,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
  symlink,
  utimes,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import { replaceRunFile } from "@oh-my-otter/benchmarks";
import { main } from "../src/cli";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function invoke(
  argv: string[],
  options: {
    cwd: string;
    isTTY?: boolean;
    confirm?: (question: string) => Promise<boolean>;
    answers?: string[];
  },
) {
  let stdout = "";
  let stderr = "";
  const asked: string[] = [];
  const confirms: string[] = [];
  const answers = [...(options.answers ?? [])];
  const code = await main(argv, {
    cwd: options.cwd,
    isTTY: options.isTTY ?? false,
    confirm: async (question) => {
      confirms.push(question);
      return options.confirm ? options.confirm(question) : false;
    },
    ask: async (question) => {
      asked.push(question);
      return answers.shift() ?? "";
    },
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return {
    code,
    stdout: stripVTControlCharacters(stdout),
    stderr: stripVTControlCharacters(stderr),
    asked,
    confirms,
  };
}

async function git(cwd: string, args: string[]) {
  return String((await execa("git", args, { cwd })).stdout);
}

async function repo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "omot-bench-"));
  tempDirs.push(root);
  await git(root, ["init", "-q", "--initial-branch=main"]);
  await git(root, ["config", "core.autocrlf", "false"]);
  await git(root, ["config", "user.name", "Test"]);
  await git(root, ["config", "user.email", "test@example.invalid"]);
  await git(root, ["config", "commit.gpgsign", "false"]);
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), contents);
  }
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-qm", "baseline"]);
  return root;
}

const fixture = {
  "package.json": `${JSON.stringify({ name: "f", private: true, type: "module", scripts: { test: "node --test" } })}\n`,
  "package-lock.json": "{}\n",
  ".gitignore": "node_modules\n",
  "src/math.mjs": "export function add(a, b) {\n  return a + b;\n}\n",
};
const coverageFixture = {
  ...fixture,
  "package.json":
    JSON.stringify({
      name: "f",
      private: true,
      type: "module",
      scripts: {
        test: `node -e "require('node:fs').writeFileSync('coverage.txt', 'generated')"`,
      },
    }) + "\n",
};
const changedGitignoreFixture = {
  ...fixture,
  "package.json":
    JSON.stringify({
      name: "f",
      private: true,
      type: "module",
      scripts: {
        test: `node -e "require('node:fs').appendFileSync('.gitignore', 'coverage/\\n')"`,
      },
    }) + "\n",
};
const changedNestedRepoFixture = {
  ...fixture,
  "package.json":
    JSON.stringify({
      name: "f",
      private: true,
      type: "module",
      scripts: {
        test: `node -e "require('node:fs').writeFileSync('nested/generated.txt', 'generated')"`,
      },
    }) + "\n",
};
const cleanBranchFixture = {
  ...fixture,
  ".gitignore": "node_modules\n.omot/\n",
};
const noGitignoreFixture = {
  "package.json": fixture["package.json"],
  "package-lock.json": fixture["package-lock.json"],
  "src/math.mjs": fixture["src/math.mjs"],
};
const addTest = `import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "../src/math.mjs";
test("add", () => assert.equal(add(1, 2), 3));
`;
const fixFailingFixture = {
  ...cleanBranchFixture,
  "src/math.mjs": "export function add(a, b) { return a >= b; }\n",
  "test/add.test.mjs": `import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "../src/math.mjs";
test("add", () => assert.equal(add(2, 2), true));
`,
};
const start = [
  "bench",
  "start",
  "add-unit-test",
  "--param",
  "file=src/math.mjs",
  "--param",
  "function=add",
];

async function runFile(root: string) {
  return JSON.parse(await readFile(path.join(root, ".omot/run.json"), "utf8"));
}

async function startFixFailingTask(root: string) {
  const result = await invoke(
    [
      "bench",
      "start",
      "fix-failing-test",
      "--param",
      "file=src/math.mjs",
      "--yes",
    ],
    { cwd: root },
  );
  expect(result.code, result.stderr).toBe(0);
  const run = await runFile(root);
  return {
    branch: (run.baseline.data as { branch: string }).branch,
    run,
  };
}

async function addDirtyNestedRepo(root: string): Promise<string> {
  const nested = path.join(root, "nested");
  await mkdir(nested);
  await git(nested, ["init", "-q", "--initial-branch=main"]);
  await git(nested, ["config", "user.name", "Test"]);
  await git(nested, ["config", "user.email", "test@example.invalid"]);
  await git(nested, ["config", "commit.gpgsign", "false"]);
  await writeFile(path.join(nested, "tracked.txt"), "tracked\n");
  await git(nested, ["add", "tracked.txt"]);
  await git(nested, ["commit", "-qm", "nested baseline"]);
  await git(root, ["add", "nested"]);
  await git(root, ["commit", "-qm", "add nested repo"]);
  await writeFile(path.join(nested, "untracked.txt"), "pre-existing\n");
  return nested;
}

async function waitForFile(file: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await access(file);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error(`Timed out waiting for ${file}.`);
}

describe("bench list and show", () => {
  it("lists the six tasks", async () => {
    const result = await invoke(["bench", "list"], { cwd: os.tmpdir() });
    expect(result.code).toBe(0);
    for (const id of [
      "dep-patch-bump",
      "add-unit-test",
      "fix-lint-rule",
      "a11y-img-alt",
      "ts-strict-file",
      "fix-failing-test",
    ]) {
      expect(result.stdout).toContain(id);
    }
    const json = await invoke(["bench", "list", "--json"], {
      cwd: os.tmpdir(),
    });
    expect(JSON.parse(json.stdout).tasks).toHaveLength(6);
  });

  it("shows a task with an agent-neutral prompt", async () => {
    const result = await invoke(
      ["bench", "show", "dep-patch-bump", "--param", "package=zod"],
      { cwd: os.tmpdir() },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Paste this into your coding agent:");
    expect(result.stdout).toContain("Update the npm dependency `zod`");
    expect(result.stdout).toContain(
      "Start: omot bench start dep-patch-bump --param package=zod",
    );
    expect(result.stdout).not.toMatch(/devin/i);
  });

  it("rejects unknown tasks and bad params", async () => {
    const unknown = await invoke(["bench", "show", "nope"], {
      cwd: os.tmpdir(),
    });
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('Unknown task "nope"');
    const bad = await invoke(
      ["bench", "show", "dep-patch-bump", "--param", "package=../x"],
      {
        cwd: os.tmpdir(),
      },
    );
    expect(bad.code).toBe(1);
  });

  it("describes Oh My Otter as agent-neutral in help", async () => {
    const result = await invoke(["--help"], { cwd: os.tmpdir() });
    expect(result.stdout).toContain("AI coding agents");
    expect(result.stdout).toContain(
      "not affiliated with or endorsed by Cognition or any other agent vendor",
    );
  });
});

describe("bench start and verify", () => {
  it("records a baseline, appends .omot/ with --yes, and verifies non-interactively", async () => {
    const root = await repo(fixture);
    const head = (await git(root, ["rev-parse", "HEAD"])).trim();
    const started = await invoke(
      [...start, "--agent", "Claude Code", "--yes"],
      { cwd: root },
    );
    expect(started.code).toBe(0);
    expect(started.stdout).toContain(
      "Add unit tests for the function `add` in `src/math.mjs`.",
    );
    expect(started.stderr).toContain("Paste this into your coding agent:");
    expect(started.stderr).not.toMatch(/devin/i);
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe(
      "node_modules\n.omot/\n",
    );
    expect(started.stderr).toContain(
      ".gitignore was left uncommitted, and verify ignores the change.",
    );
    const run = await runFile(root);
    expect(run).toMatchObject({
      schema_version: 3,
      task: { id: "add-unit-test", version: 7 },
      params: { file: "src/math.mjs", function: "add" },
      agent: "claude-code",
      baseline: { commit: head },
      verifications: [],
    });
    expect(run.baseline.scripts).toEqual({ test: 0 });
    expect(started.stderr).toContain("Baseline scripts: test exit 0");
    expect(Date.parse(run.baseline.started_at)).not.toBeNaN();

    await writeFile(
      path.join(root, "test.add.test.mjs"),
      addTest.replace("../src", "./src"),
    );
    const verified = await invoke(
      [
        "bench",
        "verify",
        "--corrections",
        "1",
        "--minutes",
        "4",
        "--agent",
        "cursor",
      ],
      { cwd: root },
    );
    expect(verified.code).toBe(0);
    expect(verified.stdout).toContain("PASS add-unit-test v7");
    expect(verified.stdout).toContain("(attempt 1)");
    expect(verified.stdout).toContain("Baseline health recorded");
    expect(verified.stderr).toContain("Nothing was sent anywhere.");
    expect(verified.stderr).toContain(
      "Next: omot report to share it anonymously, or omot bench clean to remove the run file.",
    );
    expect(await runFile(root)).toMatchObject({
      verifications: [{ head_commit: head }],
      result: {
        outcome: "pass",
        human_corrections: 1,
        human_minutes: 4,
        attempts: 1,
      },
    });
    expect((await runFile(root)).agent).toBe("cursor");

    const second = await invoke(
      ["bench", "verify", "--corrections", "0", "--minutes", "1", "--json"],
      { cwd: root },
    );
    expect(second.code).toBe(0);
    expect(JSON.parse(second.stdout)).toMatchObject({
      verifications: [{ head_commit: head }, { head_commit: head }],
      result: { attempts: 2, outcome: "pass" },
    });
  });

  it("preserves both results from concurrent verification calls", async () => {
    const root = await repo(fixture);
    await invoke([...start, "--yes"], { cwd: root });
    await writeFile(
      path.join(root, "test.add.test.mjs"),
      addTest.replace("../src", "./src"),
    );
    const args = [
      "bench",
      "verify",
      "--corrections",
      "0",
      "--minutes",
      "0",
      "--json",
    ];

    const results = await Promise.all([
      invoke(args, { cwd: root }),
      invoke(args, { cwd: root }),
    ]);

    expect(results.map((result) => result.code)).toEqual([0, 0]);
    expect(
      results.map((result) => JSON.parse(result.stdout).result.attempts).sort(),
    ).toEqual([1, 2]);
    const run = await runFile(root);
    expect(run.verifications).toHaveLength(2);
    expect(run.result.attempts).toBe(2);
  });

  it("refuses to append a verification after the run identity changes", async () => {
    const root = await repo(fixture);
    await invoke([...start, "--yes"], { cwd: root });
    await writeFile(
      path.join(root, "test.add.test.mjs"),
      `import { existsSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "./src/math.mjs";
writeFileSync("verify-started", "");
while (!existsSync("continue-verification")) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
test("add", () => assert.equal(add(1, 2), 3));
`,
    );
    const verifying = invoke(
      ["bench", "verify", "--corrections", "0", "--minutes", "0"],
      { cwd: root },
    );
    await waitForFile(path.join(root, "verify-started"));
    const run = await runFile(root);
    run.baseline.commit = "b".repeat(40);
    await writeFile(
      path.join(root, ".omot/run.json"),
      `${JSON.stringify(run, null, 2)}\n`,
    );
    await writeFile(path.join(root, "continue-verification"), "");

    const result = await verifying;
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "run.json changed during verify; re-run bench verify",
    );
  });

  it("rejects baseline scripts that leave generated files without deleting them", async () => {
    const root = await repo(coverageFixture);
    const result = await invoke([...start, "--yes"], { cwd: root });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Baseline scripts changed the working tree: coverage.txt. Add these to .gitignore (or commit them), then run bench start again.",
    );
    expect(await readFile(path.join(root, "coverage.txt"), "utf8")).toBe(
      "generated",
    );
  });

  it("allows generated baseline files when baseline scripts are skipped", async () => {
    const root = await repo(coverageFixture);
    const result = await invoke(
      [...start, "--skip-baseline-scripts", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toContain(
      "Baseline scripts skipped; verify will report baseline health as unknown.",
    );
    await expect(access(path.join(root, "coverage.txt"))).rejects.toThrow();
    expect((await runFile(root)).baseline.scripts).toBeUndefined();
  });

  it("rejects baseline scripts that modify a pre-dirty .gitignore", async () => {
    const root = await repo(changedGitignoreFixture);
    await writeFile(path.join(root, ".gitignore"), "node_modules\n.omot/\n");
    const result = await invoke([...start, "--yes"], { cwd: root });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Baseline scripts changed the working tree: .gitignore.",
    );
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(
      "coverage/",
    );
  });

  it("allows baseline scripts when a pre-dirty .gitignore is unchanged", async () => {
    const root = await repo(fixture);
    await writeFile(path.join(root, ".gitignore"), "node_modules\n.omot/\n");
    const result = await invoke([...start, "--yes"], { cwd: root });
    expect(result.code).toBe(0);
    expect(await runFile(root)).toMatchObject({
      task: { id: "add-unit-test", version: 7 },
    });
  });

  it("allows an unchanged dirty nested repository directory", async () => {
    const root = await repo(fixture);
    await addDirtyNestedRepo(root);
    expect(
      await git(root, ["status", "--porcelain", "--untracked-files=all"]),
    ).toBe(" M nested");
    const result = await invoke([...start, "--yes"], { cwd: root });
    expect(result.code).toBe(0);
  });

  it("rejects baseline scripts that modify a dirty nested repository directory", async () => {
    const root = await repo(changedNestedRepoFixture);
    const nested = await addDirtyNestedRepo(root);
    const result = await invoke([...start, "--yes"], { cwd: root });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Baseline scripts changed the working tree: nested.",
    );
    expect(await readFile(path.join(nested, "generated.txt"), "utf8")).toBe(
      "generated",
    );
  });

  it("asks before touching .gitignore and leaves it alone when declined", async () => {
    const root = await repo(fixture);
    const result = await invoke(start, { cwd: root, isTTY: true });
    expect(result.code).toBe(0);
    expect(result.confirms[0]).toContain(
      "Append the line .omot/ to .gitignore?",
    );
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe(
      "node_modules\n",
    );
    expect((await runFile(root)).agent).toBe("unknown");
    const nonInteractive = await invoke([...start, "--yes"], { cwd: root });
    expect(nonInteractive.code).toBe(0);
  });

  it("does not touch .gitignore without a TTY or --yes", async () => {
    const root = await repo(fixture);
    const result = await invoke(start, { cwd: root });
    expect(result.code).toBe(0);
    expect(result.confirms).toEqual([]);
    expect(result.stderr).toContain("re-run with --yes");
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe(
      "node_modules\n",
    );
  });

  it("refuses to replace an unverified run without --yes", async () => {
    const root = await repo(fixture);
    expect((await invoke([...start, "--yes"], { cwd: root })).code).toBe(0);
    const again = await invoke(start, { cwd: root });
    expect(again.code).toBe(1);
    expect(again.stderr).toContain(
      ".omot/run.json already has a add-unit-test run (0 attempts); re-run with --yes to replace it",
    );

    const declined = await invoke(start, {
      cwd: root,
      isTTY: true,
      confirm: async () => false,
    });
    expect(declined.code).toBe(1);
    expect(declined.confirms[0]).toContain(
      ".omot/run.json already has a add-unit-test run (0 attempts)",
    );
    const replaced = await invoke([...start, "--yes"], { cwd: root });
    expect(replaced.code).toBe(0);
  });

  it("skips baseline scripts and reports unknown baseline health on verify", async () => {
    const root = await repo(fixture);
    const started = await invoke(
      [...start, "--skip-baseline-scripts", "--yes"],
      {
        cwd: root,
      },
    );
    expect(started.code).toBe(0);
    expect(started.stderr).toContain(
      "Baseline scripts skipped; verify will report baseline health as unknown.",
    );
    const run = await runFile(root);
    expect(run.baseline.scripts).toBeUndefined();
    await mkdir(path.join(root, "test"), { recursive: true });
    await writeFile(path.join(root, "test/add.test.mjs"), addTest);
    const verified = await invoke(
      ["bench", "verify", "--corrections", "0", "--minutes", "1"],
      { cwd: root },
    );
    expect(verified.code).toBe(0);
    expect(verified.stdout).toContain(
      "Baseline health unknown (start ran with --skip-baseline-scripts or an older omot)",
    );
  });

  it("prompts for the self-reported numbers interactively", async () => {
    const root = await repo(fixture);
    await invoke([...start, "--yes"], { cwd: root });
    await mkdir(path.join(root, "test"));
    await writeFile(path.join(root, "test/add.test.mjs"), addTest);
    const verified = await invoke(["bench", "verify"], {
      cwd: root,
      isTTY: true,
      answers: ["2", "15"],
    });
    expect(verified.code).toBe(0);
    expect(verified.asked).toHaveLength(2);
    expect((await runFile(root)).result).toMatchObject({
      human_corrections: 2,
      human_minutes: 15,
    });
  });

  it("requires the numbers when not interactive and rejects invalid ones", async () => {
    const root = await repo(fixture);
    await invoke([...start, "--yes"], { cwd: root });
    const missing = await invoke(["bench", "verify"], { cwd: root });
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("--corrections <n> and --minutes <n>");
    const invalid = await invoke(
      ["bench", "verify", "--corrections", "-1", "--minutes", "2"],
      {
        cwd: root,
      },
    );
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toContain("--corrections must be a whole number");
  });

  it("exits 1 and records a failed run", async () => {
    const root = await repo(fixture);
    await invoke([...start, "--yes"], { cwd: root });
    const verified = await invoke(
      ["bench", "verify", "--corrections", "0", "--minutes", "0", "--json"],
      { cwd: root },
    );
    expect(verified.code).toBe(1);
    expect(JSON.parse(verified.stdout).result.outcome).toBe("fail");
  });

  it("records --agent-version and --model as slugs and lets verify override them", async () => {
    const root = await repo(fixture);
    const started = await invoke(
      [
        ...start,
        "--agent",
        "Codex",
        "--agent-version",
        "1.2.3 Beta",
        "--model",
        "GPT 5.5 Codex",
        "--yes",
      ],
      { cwd: root },
    );
    expect(started.code).toBe(0);
    expect(started.stderr).toContain(
      "(agent: codex, version: 1.2.3-beta, model: gpt-5.5-codex)",
    );
    expect(await runFile(root)).toMatchObject({
      agent: "codex",
      agent_version: "1.2.3-beta",
      model: "gpt-5.5-codex",
    });
    await writeFile(
      path.join(root, "add.test.mjs"),
      addTest.replace("../src", "./src"),
    );
    const verified = await invoke(
      [
        "bench",
        "verify",
        "--corrections",
        "0",
        "--minutes",
        "1",
        "--model",
        "o9",
      ],
      { cwd: root },
    );
    expect(verified.code).toBe(0);
    expect(await runFile(root)).toMatchObject({
      agent: "codex",
      agent_version: "1.2.3-beta",
      model: "o9",
    });
  });

  it("refuses to start with uncommitted changes", async () => {
    const root = await repo(fixture);
    await writeFile(
      path.join(root, "src/math.mjs"),
      "export const add = () => 0;\n",
    );
    const result = await invoke([...start, "--yes"], { cwd: root });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("uncommitted changes (src/math.mjs)");
  });

  it("does not silently replace an invalid run file", async () => {
    const root = await repo(fixture);
    await mkdir(path.join(root, ".omot"));
    await writeFile(path.join(root, ".omot/run.json"), "{ nope");
    const result = await invoke(start, { cwd: root });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("not a valid run file");
    expect(await readFile(path.join(root, ".omot/run.json"), "utf8")).toBe(
      "{ nope",
    );
  });

  it("prints task precondition failures with the task id", async () => {
    const root = await repo({
      ...fixture,
      "package.json": `${JSON.stringify({
        name: "f",
        private: true,
        type: "module",
        scripts: { "test:unit": "node --test" },
      })}\n`,
    });
    const result = await invoke([...start, "--yes"], { cwd: root });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Cannot start add-unit-test: Precondition not met: no test script (scripts.test)",
    );
    expect(result.stderr).toContain(
      'Found test:unit; omot runs scripts.test, so add "test": "npm run test:unit" (pick the suite to measure).',
    );
  });

  it("explains how to start when there is no run", async () => {
    const root = await repo(fixture);
    const result = await invoke(
      ["bench", "verify", "--corrections", "0", "--minutes", "0"],
      {
        cwd: root,
      },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('start one with "omot bench start <id>"');
  });
});

describe("bench branches and clean", () => {
  it("switches to --branch and records its original branch", async () => {
    const root = await repo(cleanBranchFixture);
    const result = await invoke([...start, "--branch", "bench/work", "--yes"], {
      cwd: root,
    });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain(" on branch bench/work ");
    expect(await git(root, ["branch", "--show-current"])).toBe("bench/work");
    const run = await runFile(root);
    expect(run).toMatchObject({
      baseline: { branch: "bench/work", original_branch: "main" },
    });
    expect(
      await git(root, [
        "config",
        "--local",
        "--get",
        "branch.bench/work.omot-run",
      ]),
    ).toBe(run.baseline.started_at);
  });

  it("preserves a replacement run and branch when clean's snapshot changes", async () => {
    const root = await repo(cleanBranchFixture);
    const started = await invoke(
      [...start, "--branch", "bench/clean-race", "--yes"],
      { cwd: root },
    );
    expect(started.code).toBe(0);

    let replacementBytes!: Buffer;
    const cleaned = await invoke(["bench", "clean", "--delete-branch"], {
      cwd: root,
      isTTY: true,
      confirm: async () => {
        const current = await runFile(root);
        await replaceRunFile(root, {
          ...current,
          baseline: {
            ...current.baseline,
            started_at: new Date(
              Date.parse(current.baseline.started_at) + 1_000,
            ).toISOString(),
          },
        });
        replacementBytes = await readFile(path.join(root, ".omot/run.json"));
        return true;
      },
    });

    expect(cleaned.code).toBe(1);
    expect(cleaned.stderr).toContain(
      ".omot/run.json changed since clean started; nothing was removed. Re-run omot bench clean.",
    );
    expect(await readFile(path.join(root, ".omot/run.json"))).toEqual(
      replacementBytes,
    );
    expect(await git(root, ["branch", "--show-current"])).toBe(
      "bench/clean-race",
    );
  });

  it("restores the original branch and deletes the new branch after a precondition failure", async () => {
    const root = await repo({
      ...cleanBranchFixture,
      "package.json": `${JSON.stringify({
        name: "f",
        private: true,
        type: "module",
        scripts: {},
      })}\n`,
    });
    const result = await invoke(
      [...start, "--branch", "bench/failed", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Cannot start add-unit-test: Precondition not met: no test script",
    );
    expect(await git(root, ["branch", "--show-current"])).toBe("main");
    await expect(
      git(root, ["rev-parse", "--verify", "bench/failed"]),
    ).rejects.toThrow();
    await expect(
      git(root, ["config", "--local", "--get", "branch.bench/failed.omot-run"]),
    ).rejects.toThrow();
  });

  it("rejects --branch for fix-failing-test before parsing other options", async () => {
    const result = await invoke(
      ["bench", "start", "fix-failing-test", "--branch", "custom"],
      { cwd: os.tmpdir() },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "fix-failing-test creates its own omot/fix-failing-test-* branch; drop --branch.",
    );
  });

  it("rejects existing and invalid branch names", async () => {
    const root = await repo(cleanBranchFixture);
    await git(root, ["branch", "taken"]);
    const existing = await invoke([...start, "--branch", "taken", "--yes"], {
      cwd: root,
    });
    expect(existing.code).toBe(1);
    expect(existing.stderr).toContain(
      "Branch taken already exists; pick another name or drop --branch.",
    );
    const invalid = await invoke(
      [...start, "--branch", "not a branch", "--yes"],
      { cwd: root },
    );
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toContain("Invalid branch name: not a branch.");
  });

  it("reports nothing to clean when there is no run file", async () => {
    const root = await repo(cleanBranchFixture);
    const result = await invoke(["bench", "clean"], { cwd: root });
    expect(result).toMatchObject({
      code: 0,
      stdout: "Nothing to clean.\n",
    });
  });

  it("removes an orphaned stale lock when there is no run file", async () => {
    const root = await repo(cleanBranchFixture);
    await mkdir(path.join(root, ".omot"));
    const lock = path.join(root, ".omot/run.json.lock");
    await writeFile(lock, "stale");
    const stale = new Date(Date.now() - 61_000);
    await utimes(lock, stale, stale);

    const result = await invoke(["bench", "clean"], { cwd: root });
    expect(result).toMatchObject({
      code: 0,
      stdout: "Nothing to clean.\n",
    });
    await expect(access(lock)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(path.join(root, ".omot"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("leaves a fresh orphaned run lock untouched", async () => {
    const root = await repo(cleanBranchFixture);
    await mkdir(path.join(root, ".omot"));
    const lock = path.join(root, ".omot/run.json.lock");
    await writeFile(lock, "active");

    const result = await invoke(["bench", "clean"], { cwd: root });
    expect(result).toMatchObject({
      code: 0,
      stdout: "Nothing to clean; a bench command holds .omot/run.json.lock.\n",
    });
    expect(await readFile(lock, "utf8")).toBe("active");
    await access(path.join(root, ".omot"));
  });

  it("removes the run and lock, removes an empty .omot, and prints the kept-branch hint", async () => {
    const root = await repo(cleanBranchFixture);
    await invoke([...start, "--branch", "bench/kept", "--yes"], { cwd: root });
    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
    const lock = path.join(root, ".omot/run.json.lock");
    await writeFile(lock, "stale");
    const stale = new Date(Date.now() - 61_000);
    await utimes(lock, stale, stale);

    const result = await invoke(["bench", "clean", "--yes"], { cwd: root });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Removed .omot/run.json.");
    expect(result.stderr).toContain(
      "Branch bench/kept was created by omot and was kept; to delete it, run git switch main && git branch -D bench/kept",
    );
    await expect(access(path.join(root, ".omot"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe(
      gitignore,
    );
  });

  it("deletes a branch and switches back with --delete-branch --yes", async () => {
    const root = await repo(cleanBranchFixture);
    await invoke([...start, "--branch", "bench/delete", "--yes"], {
      cwd: root,
    });
    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "Deleted branch bench/delete; now on main.",
    );
    expect(await git(root, ["branch", "--show-current"])).toBe("main");
    await expect(
      git(root, ["rev-parse", "--verify", "bench/delete"]),
    ).rejects.toThrow();
    await expect(
      git(root, ["config", "--local", "--get", "branch.bench/delete.omot-run"]),
    ).rejects.toThrow();
    await expect(
      access(path.join(root, ".omot/run.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("deletes a fix-failing-test-style branch from baseline data", async () => {
    const root = await repo(cleanBranchFixture);
    const original = (await git(root, ["rev-parse", "HEAD"])).trim();
    await invoke(
      [...start, "--branch", "omot/fix-failing-test-test", "--yes"],
      {
        cwd: root,
      },
    );
    const run = await runFile(root);
    run.task = { id: "fix-failing-test", version: 1 };
    delete run.baseline.branch;
    delete run.baseline.original_branch;
    run.baseline.data = {
      branch: "omot/fix-failing-test-test",
      original_branch: "main",
      original_commit: original,
    };
    await writeFile(
      path.join(root, ".omot/run.json"),
      `${JSON.stringify(run, null, 2)}\n`,
    );

    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(0);
    expect(await git(root, ["branch", "--show-current"])).toBe("main");
    await expect(
      git(root, ["rev-parse", "--verify", "omot/fix-failing-test-test"]),
    ).rejects.toThrow();
    await expect(
      git(root, [
        "config",
        "--local",
        "--get",
        "branch.omot/fix-failing-test-test.omot-run",
      ]),
    ).rejects.toThrow();
  });

  it("deletes a legacy fix-failing-test branch without its marker", async () => {
    const root = await repo(fixFailingFixture);
    const { branch, run } = await startFixFailingTask(root);
    expect(branch).toMatch(/^omot\/fix-failing-test-/);
    expect(
      await git(root, [
        "config",
        "--local",
        "--get",
        `branch.${branch}.omot-run`,
      ]),
    ).toBe(run.baseline.started_at);
    await git(root, [
      "config",
      "--local",
      "--unset",
      `branch.${branch}.omot-run`,
    ]);

    const cleaned = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(cleaned.code).toBe(0);
    expect(await git(root, ["branch", "--show-current"])).toBe("main");
    await expect(
      git(root, ["rev-parse", "--verify", branch]),
    ).rejects.toThrow();
    await expect(
      git(root, ["config", "--local", "--get", `branch.${branch}.omot-run`]),
    ).rejects.toThrow();
  });

  it("refuses a fix-failing-test branch with a mismatched marker", async () => {
    const root = await repo(fixFailingFixture);
    const { branch } = await startFixFailingTask(root);
    await git(root, [
      "config",
      "--local",
      `branch.${branch}.omot-run`,
      "different-run",
    ]);

    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `Refusing to delete ${branch}: it is not the branch omot created for this run.`,
    );
    await access(path.join(root, ".omot/run.json"));
    expect(await git(root, ["branch", "--show-current"])).toBe(branch);
    await git(root, ["rev-parse", "--verify", branch]);
    expect(
      await git(root, [
        "config",
        "--local",
        "--get",
        `branch.${branch}.omot-run`,
      ]),
    ).toBe("different-run");
  });

  it("refuses legacy fix-failing-test branches without the task prefix", async () => {
    const root = await repo(fixFailingFixture);
    const { branch, run } = await startFixFailingTask(root);
    await git(root, [
      "config",
      "--local",
      "--unset",
      `branch.${branch}.omot-run`,
    ]);
    const renamed = "renamed/fix-failing-test";
    await git(root, ["branch", "-m", renamed]);
    (run.baseline.data as { branch: string }).branch = renamed;
    await writeFile(
      path.join(root, ".omot/run.json"),
      `${JSON.stringify(run, null, 2)}\n`,
    );

    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `Refusing to delete ${renamed}: it is not the branch omot created for this run.`,
    );
    await access(path.join(root, ".omot/run.json"));
    expect(await git(root, ["branch", "--show-current"])).toBe(renamed);
    await git(root, ["rev-parse", "--verify", renamed]);
  });

  it("refuses legacy fix-failing-test branches with multiple root commits", async () => {
    const root = await repo(fixFailingFixture);
    const { branch } = await startFixFailingTask(root);
    await git(root, [
      "config",
      "--local",
      "--unset",
      `branch.${branch}.omot-run`,
    ]);
    const { stdout: emptyTree } = await execa("git", ["mktree"], {
      cwd: root,
      input: "",
    });
    const unrelatedRoot = await git(root, [
      "commit-tree",
      emptyTree.trim(),
      "-m",
      "unrelated root",
    ]);
    await git(root, [
      "merge",
      "--allow-unrelated-histories",
      "--no-edit",
      unrelatedRoot,
    ]);
    expect(
      (await git(root, ["rev-list", "--max-parents=0", branch]))
        .trim()
        .split(/\r?\n/),
    ).toHaveLength(2);

    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `Refusing to delete ${branch}: it is not the branch omot created for this run.`,
    );
    await access(path.join(root, ".omot/run.json"));
    expect(await git(root, ["branch", "--show-current"])).toBe(branch);
    await git(root, ["rev-parse", "--verify", branch]);
  });

  it("refuses branch deletion when there are changes outside .omot", async () => {
    const root = await repo(cleanBranchFixture);
    await invoke([...start, "--branch", "bench/dirty", "--yes"], { cwd: root });
    await writeFile(path.join(root, "outside.txt"), "uncommitted\n");
    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "The working tree has uncommitted changes outside .omot/; commit or stash them before deleting bench/dirty.",
    );
    await access(path.join(root, ".omot/run.json"));
    expect(await git(root, ["branch", "--show-current"])).toBe("bench/dirty");
  });

  it("requires --yes without a TTY and leaves the run untouched", async () => {
    const root = await repo(cleanBranchFixture);
    await invoke([...start, "--yes"], { cwd: root });
    const result = await invoke(["bench", "clean"], { cwd: root });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Remove .omot/run.json; re-run with --yes to confirm.",
    );
    await access(path.join(root, ".omot/run.json"));
  });

  it("asks before cleaning in a TTY and leaves everything untouched when declined", async () => {
    const root = await repo(cleanBranchFixture);
    await invoke([...start, "--branch", "bench/cancel", "--yes"], {
      cwd: root,
    });
    const result = await invoke(["bench", "clean", "--delete-branch"], {
      cwd: root,
      isTTY: true,
    });
    expect(result.code).toBe(1);
    expect(result.confirms).toEqual([
      "Remove .omot/run.json and delete branch bench/cancel?",
    ]);
    expect(result.stderr).toContain("Cancelled.");
    await access(path.join(root, ".omot/run.json"));
    expect(await git(root, ["branch", "--show-current"])).toBe("bench/cancel");
  });

  it("removes an invalid run file without using branch metadata", async () => {
    const root = await repo(cleanBranchFixture);
    await mkdir(path.join(root, ".omot"));
    await writeFile(path.join(root, ".omot/run.json"), "{ invalid");
    const result = await invoke(["bench", "clean", "--yes"], { cwd: root });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Removed .omot/run.json.");
    await expect(access(path.join(root, ".omot"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses to clean when .omot is a symbolic link", async () => {
    const root = await repo(cleanBranchFixture);
    const target = path.join(root, "elsewhere");
    await mkdir(target);
    await symlink(target, path.join(root, ".omot"));
    const result = await invoke(["bench", "clean", "--yes"], { cwd: root });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      ".omot is a symbolic link; refusing to clean it.",
    );
  });

  it("refuses to delete a branch forged into run.json", async () => {
    const root = await repo(cleanBranchFixture);
    await invoke([...start, "--branch", "bench/forged", "--yes"], {
      cwd: root,
    });
    const run = await runFile(root);
    run.baseline.branch = "main";
    await writeFile(
      path.join(root, ".omot/run.json"),
      `${JSON.stringify(run, null, 2)}\n`,
    );

    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Refusing to delete main: it is not the branch omot created for this run.",
    );
    await access(path.join(root, ".omot/run.json"));
    expect(await git(root, ["branch", "--show-current"])).toBe("bench/forged");
    expect(await git(root, ["branch", "--list", "main"])).toContain("main");
  });

  it("refuses to delete a --branch branch reset to an unrelated root", async () => {
    const root = await repo(cleanBranchFixture);
    await invoke([...start, "--branch", "bench/unrelated", "--yes"], {
      cwd: root,
    });
    const { stdout: emptyTree } = await execa("git", ["mktree"], {
      cwd: root,
      input: "",
    });
    const unrelatedRoot = await git(root, [
      "commit-tree",
      emptyTree.trim(),
      "-m",
      "unrelated root",
    ]);
    await git(root, ["reset", "--hard", unrelatedRoot]);

    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Refusing to delete bench/unrelated: it is not the branch omot created for this run.",
    );
    await access(path.join(root, ".omot/run.json"));
    expect(await git(root, ["branch", "--show-current"])).toBe(
      "bench/unrelated",
    );
    expect(await git(root, ["rev-parse", "bench/unrelated"])).toBe(
      unrelatedRoot,
    );
  });

  it("uses the branch ref when a same-named tag points elsewhere", async () => {
    const root = await repo(cleanBranchFixture);
    await invoke([...start, "--branch", "bench/tag-shadow", "--yes"], {
      cwd: root,
    });
    const run = await runFile(root);
    const { stdout: emptyTree } = await execa("git", ["mktree"], {
      cwd: root,
      input: "",
    });
    const unrelatedRoot = await git(root, [
      "commit-tree",
      emptyTree.trim(),
      "-m",
      "unrelated root",
    ]);
    await git(root, ["tag", "bench/tag-shadow", unrelatedRoot]);
    expect(await git(root, ["rev-parse", "refs/tags/bench/tag-shadow"])).toBe(
      unrelatedRoot,
    );
    expect(await git(root, ["rev-parse", "refs/heads/bench/tag-shadow"])).toBe(
      run.baseline.commit,
    );

    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Deleted branch bench/tag-shadow");
    expect(await git(root, ["branch", "--show-current"])).toBe("main");
    await expect(
      git(root, ["rev-parse", "--verify", "refs/heads/bench/tag-shadow"]),
    ).rejects.toThrow();
    expect(await git(root, ["rev-parse", "refs/tags/bench/tag-shadow"])).toBe(
      unrelatedRoot,
    );
  });

  it("refuses a forged descendant branch without an ownership marker", async () => {
    const root = await repo(cleanBranchFixture);
    await invoke([...start, "--branch", "bench/created", "--yes"], {
      cwd: root,
    });
    const run = await runFile(root);
    await writeFile(path.join(root, "descendant.txt"), "descendant\n");
    await git(root, ["add", "descendant.txt"]);
    await git(root, ["commit", "-m", "descendant commit"]);
    await git(root, ["switch", "--quiet", "-c", "bench/descendant"]);
    run.baseline.branch = "bench/descendant";
    await writeFile(
      path.join(root, ".omot/run.json"),
      `${JSON.stringify(run, null, 2)}\n`,
    );

    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Refusing to delete bench/descendant: it is not the branch omot created for this run.",
    );
    await access(path.join(root, ".omot/run.json"));
    expect(await git(root, ["branch", "--show-current"])).toBe(
      "bench/descendant",
    );
    expect(
      await git(root, ["merge-base", run.baseline.commit, "bench/descendant"]),
    ).toBe(run.baseline.commit);
  });

  it("does not print a kept-branch hint for untrusted branch metadata", async () => {
    const root = await repo(cleanBranchFixture);
    await invoke([...start, "--branch", "bench/untrusted", "--yes"], {
      cwd: root,
    });
    const run = await runFile(root);
    run.baseline.branch = "main";
    await writeFile(
      path.join(root, ".omot/run.json"),
      `${JSON.stringify(run, null, 2)}\n`,
    );
    const result = await invoke(["bench", "clean", "--yes"], { cwd: root });
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("Branch main was created by omot");
  });

  it("deletes a branch after start appends the uncommitted .omot ignore line", async () => {
    const root = await repo(fixture);
    await invoke([...start, "--branch", "bench/gitignore", "--yes"], {
      cwd: root,
    });
    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Deleted branch bench/gitignore");
    expect(result.stdout).toContain("Removed .omot/run.json.");
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(
      ".omot/",
    );
    expect(await git(root, ["branch", "--show-current"])).toBe("main");
  });

  it("deletes a branch when start creates an untracked .gitignore with only the omot line", async () => {
    const root = await repo(noGitignoreFixture);
    await invoke([...start, "--branch", "bench/new-ignore", "--yes"], {
      cwd: root,
    });
    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(0);
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe(
      ".omot/\n",
    );
  });

  it("still refuses to delete when .gitignore has other uncommitted changes", async () => {
    const root = await repo(fixture);
    await invoke([...start, "--branch", "bench/dirty-ignore", "--yes"], {
      cwd: root,
    });
    await writeFile(
      path.join(root, ".gitignore"),
      "node_modules\n.omot/\ncoverage/\n",
    );
    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "The working tree has uncommitted changes outside .omot/",
    );
    await access(path.join(root, ".omot/run.json"));
  });

  it("reports and cleans when no omot-created branch is recorded", async () => {
    const root = await repo(fixture);
    await invoke([...start, "--yes"], { cwd: root });
    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("No omot-created branch to delete.");
    expect(result.stdout).toContain("Removed .omot/run.json.");
    await expect(
      access(path.join(root, ".omot/run.json")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reports and cleans when the recorded omot-created branch no longer exists", async () => {
    const root = await repo(fixture);
    await invoke([...start, "--branch", "bench/gone", "--yes"], {
      cwd: root,
    });
    await git(root, ["switch", "main"]);
    await git(root, ["branch", "-D", "bench/gone"]);
    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("No omot-created branch to delete.");
    expect(result.stdout).toContain("Removed .omot/run.json.");
  });

  it("restores a detached original commit before deleting the created branch", async () => {
    const root = await repo(cleanBranchFixture);
    const original = (await git(root, ["rev-parse", "HEAD"])).trim();
    await git(root, ["switch", "--detach", original]);
    await invoke([...start, "--branch", "bench/detached", "--yes"], {
      cwd: root,
    });
    const result = await invoke(
      ["bench", "clean", "--delete-branch", "--yes"],
      { cwd: root },
    );
    expect(result.code).toBe(0);
    expect(await git(root, ["rev-parse", "HEAD"])).toBe(original);
    expect(await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("HEAD");
    await expect(
      git(root, ["rev-parse", "--verify", "bench/detached"]),
    ).rejects.toThrow();
  });
});
