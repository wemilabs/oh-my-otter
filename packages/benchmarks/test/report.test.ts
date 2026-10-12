import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createCheckContext } from "@oh-my-otter/core/node";
import {
  agentsFileSchema,
  BUILTIN_CHECK_IDS,
  BUILTIN_TASK_IDS,
  buildReportPayload,
  canonicalAgent,
  checkReportPlausibility,
  EXAMPLE_REPORT_PAYLOAD,
  ingestIssue,
  parseReportsNdjson,
  rateLimitProblem,
  reportPayloadSchema,
  serializeReportLine,
  serializeReportPayload,
} from "../src/report";
import { builtinTasks, detectStack, summarizeScan } from "../src/index";
import { runChecks } from "@oh-my-otter/core";
import { builtinChecks } from "@oh-my-otter/checks";
import type { RunFile } from "../src/index";
import { createRepo } from "./helpers";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoRoot = path.resolve(packageRoot, "../..");

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function agentsFile() {
  return agentsFileSchema.parse(
    JSON.parse(
      await readFile(path.join(repoRoot, "dataset/agents.json"), "utf8"),
    ),
  );
}

const verifiedRun: RunFile = {
  schema_version: 3,
  task: { id: "add-unit-test", version: 4 },
  params: { file: "src/math.mjs", function: "add" },
  agent: "claude-code",
  agent_version: "2.1.0",
  model: "claude-opus-4",
  baseline: {
    commit: "a".repeat(40),
    started_at: "2026-10-12T16:00:00.000Z",
  },
  verifications: [
    {
      outcome: "pass",
      reasons: ["ok"],
      verified_at: "2026-10-12T16:30:00.000Z",
      head_commit: "b".repeat(40),
      human_corrections: 1,
      human_minutes: 12,
      agent: "claude-code",
    },
  ],
  result: {
    outcome: "pass",
    reasons: ["ok"],
    verified_at: "2026-10-12T16:30:00.000Z",
    human_corrections: 1,
    human_minutes: 12,
    attempts: 1,
  },
};

const scan = {
  scoring_version: 1,
  readiness_score: 82,
  checks: { "test-script": "pass" as const },
  stack: {
    package_manager: "pnpm" as const,
    language: "typescript" as const,
    framework: "nextjs" as const,
  },
};

describe("report payload schema", () => {
  it("matches the JSON schema snapshot", () => {
    expect(z.toJSONSchema(reportPayloadSchema)).toMatchSnapshot();
  });

  it("keeps the documented key order", () => {
    expect(Object.keys(reportPayloadSchema.shape)).toEqual([
      "schema_version",
      "cli_version",
      "scoring_version",
      "task_id",
      "task_version",
      "agent",
      "agent_version",
      "model",
      "outcome",
      "human_corrections",
      "human_minutes",
      "attempts",
      "readiness_score",
      "checks",
      "stack",
      "submitted_on",
    ]);
  });

  it("parses the example payload and serializes it deterministically", () => {
    expect(reportPayloadSchema.parse(EXAMPLE_REPORT_PAYLOAD)).toEqual(
      EXAMPLE_REPORT_PAYLOAD,
    );
    expect(serializeReportPayload(EXAMPLE_REPORT_PAYLOAD)).toBe(
      serializeReportPayload({
        ...EXAMPLE_REPORT_PAYLOAD,
        outcome: "pass",
      }),
    );
  });

  it("rejects extra keys, custom check ids, and bad values", () => {
    expect(
      reportPayloadSchema.safeParse({ ...EXAMPLE_REPORT_PAYLOAD, repo: "x" })
        .success,
    ).toBe(false);
    expect(
      reportPayloadSchema.safeParse({
        ...EXAMPLE_REPORT_PAYLOAD,
        checks: { "my-plugin-check": "pass" },
      }).success,
    ).toBe(false);
    for (const patch of [
      { agent: "Not A Slug!" },
      { submitted_on: "2026-10-10T00:00:00Z" },
      { submitted_on: "yesterday" },
      { human_corrections: -1 },
      { attempts: 0 },
      { readiness_score: 101 },
      { cli_version: "v0.3.0!" },
      { task_id: "not-a-task" },
    ]) {
      expect(
        reportPayloadSchema.safeParse({
          ...EXAMPLE_REPORT_PAYLOAD,
          ...patch,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects slugs that look like secrets", () => {
    for (const good of [
      "claude-opus-4",
      "gpt-5.1-codex",
      "claude-opus-4-1-20250805",
      "2.1.0",
      "gemini-2.5-pro",
      "llama-3.1-nemotron-70b-instruct-hf",
      "claude-sonnet-4-5-20250929-thinking",
      "gpt-4o-mini-2024-07-18",
      "qwen2.5-coder-32b",
      "2.0.0-alpha1-beta2-rc03",
    ]) {
      for (const field of ["agent", "agent_version", "model"] as const) {
        expect(
          reportPayloadSchema.safeParse({
            ...EXAMPLE_REPORT_PAYLOAD,
            [field]: good,
          }).success,
        ).toBe(true);
      }
    }
    for (const bad of [
      "ghp_abcdef123456",
      "sk-proj-abc123",
      "a".repeat(20) + "1".repeat(20),
      "npm_abc123def",
      "ab12cd-34ef56-gh78ij-90kl12-mn34op",
      "a1b2-c3d4-e5f6-g7h8-i9j0-k1l2-m3n4-o5p6",
    ]) {
      for (const field of ["agent", "agent_version", "model"] as const) {
        expect(
          reportPayloadSchema.safeParse({
            ...EXAMPLE_REPORT_PAYLOAD,
            [field]: bad,
          }).success,
        ).toBe(false);
      }
    }
  });

  it("derives task and check ids from the registry", () => {
    expect([...BUILTIN_TASK_IDS].sort()).toEqual(
      builtinTasks.map((task) => task.manifest.id).sort(),
    );
    expect(BUILTIN_CHECK_IDS.length).toBeGreaterThan(0);
  });
});

describe("PRIVACY.md example", () => {
  it("matches EXAMPLE_REPORT_PAYLOAD exactly", async () => {
    const privacy = await readFile(path.join(repoRoot, "PRIVACY.md"), "utf8");
    const blocks = privacy.match(/```json\n([\s\S]*?)```/g) ?? [];
    expect(blocks).toHaveLength(1);
    const raw = blocks[0]!.slice("```json\n".length, -"```".length);
    expect(JSON.parse(raw)).toEqual(EXAMPLE_REPORT_PAYLOAD);
    expect(raw.trim()).toBe(
      serializeReportPayload(EXAMPLE_REPORT_PAYLOAD).trim(),
    );
  });
});

describe("buildReportPayload", () => {
  it("throws for an unverified run", () => {
    const { result: _ignored, ...rest } = verifiedRun;
    void _ignored;
    expect(() =>
      buildReportPayload(rest as RunFile, scan, {
        cliVersion: "0.3.0",
        today: new Date("2026-10-10T12:00:00Z"),
      }),
    ).toThrow("hasn't been verified yet");
  });

  it("builds the payload and leaks no repo details", () => {
    const run: RunFile = {
      ...verifiedRun,
      agent: "cursor",
      params: { file: "src/secret/math.mjs", function: "add" },
      verifications: [
        {
          ...verifiedRun.verifications[0]!,
          reasons: ["src/secret/math.mjs broke @scope/pkg"],
        },
      ],
      result: {
        ...verifiedRun.result!,
        reasons: ["src/secret/math.mjs broke @scope/pkg"],
      },
    };
    const payload = buildReportPayload(run, scan, {
      cliVersion: "0.3.0",
      today: new Date("2026-10-10T23:30:00Z"),
    });
    expect(payload.agent).toBe("cursor");
    expect(payload.attempts).toBe(1);
    expect(payload.submitted_on).toBe("2026-10-10");
    const json = serializeReportPayload(payload);
    for (const leak of [
      "src/secret/math.mjs",
      "@scope/pkg",
      "a".repeat(40),
      "b".repeat(40),
      "omot",
    ]) {
      expect(json).not.toContain(leak);
    }
  });
});

describe("detectStack", () => {
  async function stackOf(files: Record<string, string>) {
    const root = await createRepo(files);
    return detectStack(createCheckContext(root));
  }

  it("detects pnpm + next + typescript", async () => {
    expect(
      await stackOf({
        "package.json": JSON.stringify({
          name: "f",
          packageManager: "pnpm@9.0.0",
          dependencies: { next: "latest" },
        }),
        "pnpm-lock.yaml": "",
        "tsconfig.json": "{}",
      }),
    ).toEqual({
      package_manager: "pnpm",
      language: "typescript",
      framework: "nextjs",
    });
  });

  it("detects yarn + react + javascript", async () => {
    expect(
      await stackOf({
        "package.json": JSON.stringify({
          name: "f",
          dependencies: { react: "latest" },
        }),
        "yarn.lock": "",
      }),
    ).toEqual({
      package_manager: "yarn",
      language: "javascript",
      framework: "react",
    });
  });

  it("detects the bun lockfile", async () => {
    expect(
      (
        await stackOf({
          "package.json": JSON.stringify({ name: "f" }),
          "bun.lock": "",
        })
      ).package_manager,
    ).toBe("bun");
    expect(
      (
        await stackOf({
          "package.json": JSON.stringify({ name: "f" }),
          "bun.lockb": "",
        })
      ).package_manager,
    ).toBe("bun");
  });

  it("finds next and tsconfig inside a workspace package", async () => {
    expect(
      await stackOf({
        "package.json": JSON.stringify({ name: "f", private: true }),
        "package-lock.json": "{}",
        "apps/web/package.json": JSON.stringify({
          name: "web",
          dependencies: { next: "latest" },
        }),
        "apps/web/tsconfig.json": "{}",
      }),
    ).toEqual({
      package_manager: "npm",
      language: "typescript",
      framework: "nextjs",
    });
  });

  it("reports other/other without a package.json", async () => {
    expect(await stackOf({ "README.md": "hi\n" })).toEqual({
      package_manager: "other",
      language: "javascript",
      framework: "other",
    });
  });

  it("strips comments from pnpm-workspace.yaml packages globs", async () => {
    expect(
      await stackOf({
        "package.json": JSON.stringify({ name: "f", private: true }),
        "pnpm-workspace.yaml":
          'packages:\n  - "services/*" # apps\nother: true\n',
        "services/api/package.json": JSON.stringify({
          name: "api",
          dependencies: { next: "latest" },
        }),
        "services/api/tsconfig.json": "{}",
      }),
    ).toEqual({
      package_manager: "npm",
      language: "typescript",
      framework: "nextjs",
    });
  });

  it("scans configured workspace globs before the defaults", async () => {
    const root = await createRepo({
      "package.json": JSON.stringify({
        name: "f",
        private: true,
        workspaces: ["libs/*"],
      }),
      "libs/one/package.json": JSON.stringify({ name: "one" }),
      "libs/two/package.json": JSON.stringify({ name: "two" }),
      "apps/web/package.json": JSON.stringify({
        name: "web",
        dependencies: { next: "latest" },
      }),
      "apps/web/tsconfig.json": "{}",
    });
    // Cap of 2 means only the two configured manifests are scanned,
    // so apps/web's next is never seen.
    expect(await detectStack(createCheckContext(root), 2)).toEqual({
      package_manager: "npm",
      language: "javascript",
      framework: "node",
    });
  });

  it("follows pnpm-workspace.yaml packages globs", async () => {
    expect(
      await stackOf({
        "package.json": JSON.stringify({ name: "f", private: true }),
        "pnpm-workspace.yaml": 'packages:\n  - "services/*"\nother: true\n',
        "services/api/package.json": JSON.stringify({
          name: "api",
          dependencies: { next: "latest" },
        }),
        "services/api/tsconfig.json": "{}",
      }),
    ).toEqual({
      package_manager: "npm",
      language: "typescript",
      framework: "nextjs",
    });
  });

  it("follows package.json workspaces globs", async () => {
    expect(
      await stackOf({
        "package.json": JSON.stringify({
          name: "f",
          private: true,
          workspaces: ["libs/*"],
        }),
        "libs/api/package.json": JSON.stringify({
          name: "api",
          dependencies: { next: "latest" },
        }),
        "libs/api/tsconfig.json": "{}",
      }),
    ).toEqual({
      package_manager: "npm",
      language: "typescript",
      framework: "nextjs",
    });
  });
});

describe("agents file", () => {
  it("parses dataset/agents.json", async () => {
    const agents = await agentsFile();
    expect(agents.agents.length).toBeGreaterThan(5);
  });

  it("maps slugs to canonical agents", async () => {
    const agents = await agentsFile();
    expect(canonicalAgent("claude", agents)).toBe("claude-code");
    expect(canonicalAgent("claude-code", agents)).toBe("claude-code");
    expect(canonicalAgent("unknown", agents)).toBe("other");
    expect(canonicalAgent("my-agent", agents)).toBe("other");
  });
});

function validBody(payload: unknown = EXAMPLE_REPORT_PAYLOAD): string {
  return `Submitted by @OtterFan42 — thanks!\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\nFiled via omot report.`;
}

const ingestDefaults = {
  latestCliVersion: "0.3.0",
  recent: [],
  open: [],
  now: new Date("2026-10-10T12:34:56Z"),
} as const;

describe("ingestIssue", () => {
  const input = (overrides: Partial<Parameters<typeof ingestIssue>[0]>) =>
    ingestIssue({
      body: validBody(),
      author: "SomeoneElse",
      agents: {
        agents: [{ id: "claude", display_name: "C", aliases: ["claude-code"] }],
      },
      ...ingestDefaults,
      ...overrides,
    });

  it("rejects bodies without JSON, broken JSON, extras, wrong types, and oversized bodies", async () => {
    const agents = await agentsFile();
    for (const bad of [
      "no json here",
      "```json\n{broken\n```",
      validBody({ ...EXAMPLE_REPORT_PAYLOAD, wat: 1 }),
      validBody({ ...EXAMPLE_REPORT_PAYLOAD, attempts: "one" }),
      `${"x".repeat(20_001)}{"a":1}`,
    ]) {
      const result = ingestIssue({
        body: bad,
        author: "someone",
        agents,
        ...ingestDefaults,
        now: new Date(),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.comment).toContain("`");
    }
  });

  it("lists the failing path in the comment", async () => {
    const result = ingestIssue({
      body: validBody({ ...EXAMPLE_REPORT_PAYLOAD, attempts: "one" }),
      author: "someone",
      agents: await agentsFile(),
      ...ingestDefaults,
      now: new Date(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.comment).toContain("- attempts:");
  });

  it("never echoes attacker text from the body", async () => {
    const agents = await agentsFile();
    const base = {
      author: "someone",
      agents,
      ...ingestDefaults,
      now: new Date(),
    };
    for (const [body, needles] of [
      [
        `{"schema_version":1,"<script>evil</script>":"x"}`,
        ["evil", "<script>", "http"],
      ],
      [`{ "a": SPAM-LINK-http://evil }`, ["evil", "http"]],
      [
        validBody({
          ...EXAMPLE_REPORT_PAYLOAD,
          checks: { "https://evil.example": "pass" },
        }),
        ["evil", "http"],
      ],
    ] as const) {
      const result = ingestIssue({ ...base, body });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      for (const needle of needles) {
        expect(result.comment).not.toContain(needle);
      }
    }
  });

  it("accepts a valid report and returns one ndjson line without the username", async () => {
    const result = ingestIssue({
      body: validBody(),
      author: "OtterFan42",
      agents: await agentsFile(),
      ...ingestDefaults,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.line).not.toContain("\n");
    expect(result.line.toLowerCase()).not.toContain("otterfan42");
    expect(reportPayloadSchema.parse(JSON.parse(result.line))).toEqual(
      EXAMPLE_REPORT_PAYLOAD,
    );
    expect(parseReportsNdjson(`${result.line}\n`).reports).toEqual([
      EXAMPLE_REPORT_PAYLOAD,
    ]);
  });

  it("rejects an agent field containing the author's handle", async () => {
    const result = input({
      author: "OtterFan42",
      agents: await agentsFile(),
      body: validBody({ ...EXAMPLE_REPORT_PAYLOAD, agent: "otterfan42-bot" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.comment).toContain("username");
  });

  it("screens non-canonical handles per field, not per handle", async () => {
    const agents = await agentsFile();
    const run = (author: string, payload: unknown) =>
      ingestIssue({
        body: validBody(payload),
        author,
        agents,
        ...ingestDefaults,
        now: new Date(),
      });
    // A canonical agent slug always passes, whoever submits it.
    expect(run("codex", { ...EXAMPLE_REPORT_PAYLOAD, agent: "codex" }).ok).toBe(
      true,
    );
    expect(
      run("ode", { ...EXAMPLE_REPORT_PAYLOAD, model: "gpt-5-codex" }).ok,
    ).toBe(true);
    for (const [author, payload] of [
      ["codex", { ...EXAMPLE_REPORT_PAYLOAD, model: "codex-private" }],
      ["codex", { ...EXAMPLE_REPORT_PAYLOAD, model: "gpt-5-codex" }],
      ["devin-ai", { ...EXAMPLE_REPORT_PAYLOAD, model: "devin-ai-private" }],
      ["jdoe42", { ...EXAMPLE_REPORT_PAYLOAD, model: "x-jdoe42" }],
      ["jdoe42", { ...EXAMPLE_REPORT_PAYLOAD, model: "jdoe42-model" }],
      ["claude-fan", { ...EXAMPLE_REPORT_PAYLOAD, model: "claude-fan-build" }],
    ] as const) {
      const rejected = run(author, payload);
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) expect(rejected.comment).toContain("username");
    }
  });

  it("accepts an agent that equals a canonical alias even if it matches the handle", async () => {
    const result = ingestIssue({
      body: validBody({
        schema_version: 1,
        cli_version: "0.3.0",
        scoring_version: 1,
        task_id: "add-unit-test",
        task_version: 1,
        agent: "claude",
        outcome: "pass",
        human_corrections: 1,
        human_minutes: 12,
        attempts: 1,
        readiness_score: 100,
        checks: { "test-script": "pass" },
        stack: {
          package_manager: "pnpm",
          language: "typescript",
          framework: "nextjs",
        },
        submitted_on: "2026-10-10",
      }),
      author: "claude",
      agents: await agentsFile(),
      ...ingestDefaults,
      now: new Date(),
    });
    expect(result.ok).toBe(true);
  });

  it("serializes a report line in canonical key order", () => {
    const line = serializeReportLine(EXAMPLE_REPORT_PAYLOAD);
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual(EXAMPLE_REPORT_PAYLOAD);
    expect(Object.keys(JSON.parse(line))).toEqual(
      Object.keys(JSON.parse(serializeReportPayload(EXAMPLE_REPORT_PAYLOAD))),
    );
  });
});

describe("parseReportsNdjson", () => {
  const line = serializeReportLine(EXAMPLE_REPORT_PAYLOAD);

  it("parses valid lines and skips blank ones", () => {
    const { reports, invalid } = parseReportsNdjson(`${line}\n\n${line}\n`);
    expect(reports).toEqual([EXAMPLE_REPORT_PAYLOAD, EXAMPLE_REPORT_PAYLOAD]);
    expect(invalid).toEqual([]);
    expect(parseReportsNdjson("")).toEqual({ reports: [], invalid: [] });
  });

  it("collects line numbers for invalid JSON and schema-invalid payloads", () => {
    const { reports, invalid } = parseReportsNdjson(
      [
        "{not json",
        line,
        JSON.stringify({ ...EXAMPLE_REPORT_PAYLOAD, outcome: "maybe" }),
        JSON.stringify(EXAMPLE_REPORT_PAYLOAD).slice(0, -2),
      ].join("\n"),
    );
    expect(reports).toEqual([EXAMPLE_REPORT_PAYLOAD]);
    expect(invalid).toEqual([1, 3, 4]);
  });
});

describe("rateLimitProblem", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const issue = (n: number, minutesAgo = 30) => ({
    number: n,
    created_at: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
  });

  it("passes under the limit", () => {
    expect(
      rateLimitProblem({
        recent: [issue(1), issue(2)],
        open: [issue(1)],
        currentIssueNumber: 9,
        now,
      }),
    ).toBeNull();
  });

  it("rejects three recent report issues", () => {
    expect(
      rateLimitProblem({
        recent: [issue(1), issue(2), issue(3)],
        open: [],
        currentIssueNumber: 9,
        now,
      }),
    ).not.toBeNull();
    // Older issues don't count.
    expect(
      rateLimitProblem({
        recent: [issue(1), issue(2), issue(3, 90)],
        open: [],
        currentIssueNumber: 9,
        now,
      }),
    ).toBeNull();
  });

  it("rejects three open report issues", () => {
    expect(
      rateLimitProblem({
        recent: [],
        open: [issue(1), issue(2), issue(3)],
        currentIssueNumber: 9,
        now,
      }),
    ).not.toBeNull();
  });

  it("excludes pull requests and the current issue", () => {
    expect(
      rateLimitProblem({
        recent: [
          { ...issue(1), pull_request: {} },
          { ...issue(2), pull_request: {} },
          issue(9),
        ],
        open: [issue(9)],
        currentIssueNumber: 9,
        now,
      }),
    ).toBeNull();
  });
});

describe("checkReportPlausibility", () => {
  const ctx = {
    latestCliVersion: "0.3.0",
    today: new Date("2026-10-10T12:00:00Z"),
  };

  it("accepts the example payload", () => {
    expect(checkReportPlausibility(EXAMPLE_REPORT_PAYLOAD, ctx)).toEqual([]);
  });

  it("flags doctored fields", () => {
    const plausible = (patch: Partial<typeof EXAMPLE_REPORT_PAYLOAD>) =>
      checkReportPlausibility({ ...EXAMPLE_REPORT_PAYLOAD, ...patch }, ctx);
    expect(plausible({ readiness_score: 100 })).toHaveLength(1);
    expect(plausible({ task_version: 99 })).toHaveLength(1);
    expect(plausible({ cli_version: "9.9.9" })).toHaveLength(1);
    expect(plausible({ submitted_on: "2026-10-20" })).toHaveLength(1);
    // One day of grace is allowed.
    expect(plausible({ submitted_on: "2026-10-11" })).toEqual([]);
    // Older cli versions are fine.
    expect(plausible({ cli_version: "0.1.0" })).toEqual([]);
  });

  it("recomputes a real scan score exactly", async () => {
    const root = await createRepo({
      "package.json": JSON.stringify({
        name: "f",
        scripts: { test: "node --test" },
      }),
      "package-lock.json": "{}",
      "tsconfig.json": "{}",
    });
    const ctx2 = createCheckContext(root);
    const report = await runChecks(builtinChecks, ctx2);
    const stack = await detectStack(ctx2);
    const summary = summarizeScan(report, stack);
    const payload = buildReportPayload(verifiedRun, summary, {
      cliVersion: "0.3.0",
      today: new Date("2026-10-10T12:00:00Z"),
    });
    expect(
      checkReportPlausibility(payload, {
        latestCliVersion: "0.3.0",
        today: new Date("2026-10-10T12:00:00Z"),
      }),
    ).toEqual([]);
  });
});
