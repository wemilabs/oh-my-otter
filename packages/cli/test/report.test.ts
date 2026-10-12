import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import { reportPayloadSchema } from "@oh-my-otter/benchmarks/report";
import { main } from "../src/cli";
import { REPORT_REPO_URL, runReport } from "../src/report";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

interface Captured {
  opened: string[];
  copied: string[];
  confirms: string[];
}

async function invoke(
  argv: string[],
  options: {
    cwd: string;
    isTTY?: boolean;
    confirm?: (question: string) => Promise<boolean>;
    answers?: string[];
    openFails?: boolean;
    clipboardFails?: boolean;
    now?: Date;
  },
) {
  let stdout = "";
  let stderr = "";
  const captured: Captured = { opened: [], copied: [], confirms: [] };
  const answers = [...(options.answers ?? [])];
  const code = await main(argv, {
    cwd: options.cwd,
    isTTY: options.isTTY ?? false,
    confirm: async (question) => {
      captured.confirms.push(question);
      return options.confirm ? options.confirm(question) : false;
    },
    ask: async () => answers.shift() ?? "",
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    openUrl: async (url) => {
      if (options.openFails) throw new Error("no browser");
      captured.opened.push(url);
    },
    copyToClipboard: async (text) => {
      if (options.clipboardFails) throw new Error("no clipboard");
      captured.copied.push(text);
    },
    now: () => options.now ?? new Date("2026-10-10T12:00:00Z"),
  });
  return {
    code,
    stdout: stripVTControlCharacters(stdout),
    stderr: stripVTControlCharacters(stderr),
    captured,
  };
}

async function git(cwd: string, args: string[]) {
  return String((await execa("git", args, { cwd })).stdout);
}

async function repo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "omot-report-"));
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
  "--agent",
  "claude-code",
];

async function commit(cwd: string, files: Record<string, string>) {
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
    await writeFile(path.join(cwd, file), contents);
  }
  await git(cwd, ["add", "-A"]);
  await git(cwd, ["commit", "-qm", "change"]);
}

async function verifiedRepo(): Promise<string> {
  const root = await repo(fixture);
  await invoke([...start, "--yes"], { cwd: root });
  await writeFile(
    path.join(root, "add.test.mjs"),
    addTest.replace("../src", "./src"),
  );
  const verify = await invoke(
    ["bench", "verify", "--corrections", "0", "--minutes", "1"],
    { cwd: root },
  );
  expect(verify.code).toBe(0);
  return root;
}

describe("omot report", () => {
  it("fails on an unverified run", async () => {
    const root = await repo(fixture);
    await invoke([...start, "--yes"], { cwd: root });
    const result = await invoke(["report", "--dry-run"], { cwd: root });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "hasn't been verified yet; run omot bench verify first",
    );
  });

  it("--dry-run prints the exact payload and sends nothing", async () => {
    const root = await verifiedRepo();
    const result = await invoke(["report", "--dry-run"], { cwd: root });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain(
      "This is the exact data omot report would submit:",
    );
    expect(result.stderr).toContain("Dry run: nothing was sent.");
    const payload = reportPayloadSchema.parse(JSON.parse(result.stdout));
    expect(payload.task_id).toBe("add-unit-test");
    expect(payload.agent).toBe("claude-code");
    expect(payload.outcome).toBe("pass");
    expect(payload.submitted_on).toBe("2026-10-10");
    expect(result.captured.opened).toEqual([]);
    expect(result.captured.copied).toEqual([]);
    expect(result.captured.confirms).toEqual([]);
  });

  it("records readiness at start, not at report time", async () => {
    const root = await repo(fixture);
    const started = await invoke([...start, "--yes"], { cwd: root });
    expect(started.stderr).toContain("Readiness at start:");
    const run = JSON.parse(
      await readFile(path.join(root, ".omot/run.json"), "utf8"),
    );
    expect(run.baseline.scan.readiness_score).toBeGreaterThan(0);
    expect(run.baseline.scan.checks["formatter-config"]).toBeDefined();
    expect(run.baseline.scan.stack).toEqual({
      package_manager: "npm",
      language: "javascript",
      framework: "node",
    });
    const startStatus = run.baseline.scan.checks["formatter-config"];

    // Flip a check after start: it must not change the reported readiness.
    await commit(root, { ".prettierrc": "{}\n" });
    await writeFile(
      path.join(root, "add.test.mjs"),
      addTest.replace("../src", "./src"),
    );
    await invoke(["bench", "verify", "--corrections", "0", "--minutes", "1"], {
      cwd: root,
    });
    const result = await invoke(["report", "--dry-run"], { cwd: root });
    const payload = reportPayloadSchema.parse(JSON.parse(result.stdout));
    expect(payload.checks["formatter-config"]).toBe(startStatus);
    expect(payload.readiness_score).toBe(run.baseline.scan.readiness_score);
  });

  it("scans the baseline commit for legacy run files and cleans up the worktree", async () => {
    const root = await repo(fixture);
    await invoke([...start, "--yes"], { cwd: root });
    // Rewrite the run as a legacy schema-2 file with no recorded scan.
    const run = JSON.parse(
      await readFile(path.join(root, ".omot/run.json"), "utf8"),
    );
    delete run.baseline.scan;
    run.schema_version = 2;
    await writeFile(
      path.join(root, ".omot/run.json"),
      `${JSON.stringify(run, null, 2)}\n`,
    );
    // Flip a check at HEAD so a wrong tree would produce a different status.
    await commit(root, { ".prettierrc": "{}\n" });
    await writeFile(
      path.join(root, "add.test.mjs"),
      addTest.replace("../src", "./src"),
    );
    await invoke(["bench", "verify", "--corrections", "0", "--minutes", "1"], {
      cwd: root,
    });
    // Verify rewrites run.json as schema 3, still without a scan.
    const updated = JSON.parse(
      await readFile(path.join(root, ".omot/run.json"), "utf8"),
    );
    updated.schema_version = 2;
    await writeFile(
      path.join(root, ".omot/run.json"),
      `${JSON.stringify(updated, null, 2)}\n`,
    );

    const result = await invoke(["report", "--dry-run"], { cwd: root });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("didn't record readiness at start");
    const payload = reportPayloadSchema.parse(JSON.parse(result.stdout));
    // The baseline commit had no .prettierrc, so formatter-config reflects
    // the baseline tree, not HEAD.
    const baselineScan = JSON.parse(
      await git(root, ["show", `${updated.baseline.commit}:package.json`]),
    );
    expect(baselineScan.name).toBe("f");
    expect(payload.checks["formatter-config"]).not.toBe("pass");

    const worktrees = await git(root, ["worktree", "list"]);
    expect(worktrees.trim().split("\n")).toHaveLength(1);
  });

  it("refuses to submit without a TTY", async () => {
    const root = await verifiedRepo();
    const result = await invoke(["report"], { cwd: root, isTTY: false });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("confirming needs an interactive terminal");
  });

  it("does not submit when confirmation is declined", async () => {
    const root = await verifiedRepo();
    const result = await invoke(["report"], {
      cwd: root,
      isTTY: true,
      confirm: async () => false,
    });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("Not submitted.");
    expect(result.captured.opened).toEqual([]);
  });

  it("opens a prefilled issue when confirmed", async () => {
    const root = await verifiedRepo();
    const result = await invoke(["report"], {
      cwd: root,
      isTTY: true,
      confirm: async () => true,
    });
    expect(result.code).toBe(0);
    expect(result.captured.opened).toHaveLength(1);
    const url = result.captured.opened[0]!;
    expect(url).toContain(`${REPORT_REPO_URL}/issues/new?`);
    expect(url).toContain("template=report.yml");
    expect(url).toContain("payload=");
    expect(result.stderr).toContain("Opened a prefilled issue");
  });

  it("prints the URL when the browser cannot be opened", async () => {
    const root = await verifiedRepo();
    const result = await invoke(["report"], {
      cwd: root,
      isTTY: true,
      confirm: async () => true,
      openFails: true,
    });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("Couldn't open a browser");
    expect(result.stderr).toContain("template=report.yml");
  });

  it("copies to the clipboard when the URL is too long", async () => {
    const root = await verifiedRepo();
    const copied: string[] = [];
    let stderr = "";
    const code = await runReport(
      ".",
      {},
      {
        cwd: root,
        isTTY: true,
        stdout: () => {},
        stderr: (text) => {
          stderr += text;
        },
        confirm: async () => true,
        ask: async () => "",
        now: () => new Date("2026-10-10T12:00:00Z"),
        openUrl: async () => {
          throw new Error("no browser");
        },
        copyToClipboard: async (text) => {
          copied.push(text);
        },
      },
      { cliVersion: "0.3.0", maxUrlLength: 10 },
    );
    expect(code).toBe(0);
    expect(copied).toHaveLength(1);
    expect(stderr).toContain("copied to your clipboard");
  });

  it("tells the user to copy manually when clipboard access fails", async () => {
    const root = await verifiedRepo();
    let stderr = "";
    const code = await runReport(
      ".",
      {},
      {
        cwd: root,
        isTTY: true,
        stdout: () => {},
        stderr: (text) => {
          stderr += text;
        },
        confirm: async () => true,
        ask: async () => "",
        now: () => new Date("2026-10-10T12:00:00Z"),
        openUrl: async () => {},
        copyToClipboard: async () => {
          throw new Error("no clipboard");
        },
      },
      { cliVersion: "0.3.0", maxUrlLength: 10 },
    );
    expect(code).toBe(0);
    expect(stderr).toContain("Couldn't copy to the clipboard");
    expect(stderr).toContain("Report payload");
  });
});
