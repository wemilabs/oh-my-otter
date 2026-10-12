import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
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
const addTest = `import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "../src/math.mjs";
test("add", () => assert.equal(add(1, 2), 3));
`;
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
      schema_version: 2,
      task: { id: "add-unit-test", version: 2 },
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
    expect(verified.stdout).toContain("PASS add-unit-test v2");
    expect(verified.stdout).toContain("(attempt 1)");
    expect(verified.stdout).toContain("Baseline health recorded");
    expect(verified.stderr).toContain("Nothing was sent anywhere.");
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
        scripts: {},
      })}\n`,
    });
    const result = await invoke([...start, "--yes"], { cwd: root });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Cannot start add-unit-test: Precondition not met: no test script (scripts.test)",
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
