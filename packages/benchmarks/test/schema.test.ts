import { describe, expect, it } from "vitest";
import {
  getTask,
  normalizeAgent,
  parseParams,
  renderPrompt,
  runFileSchema,
  taskManifestSchema,
  verifyResultSchema,
} from "../src/index";

const run = {
  schema_version: 1,
  task: { id: "add-unit-test", version: 1 },
  params: {},
  baseline: { commit: "a".repeat(40), started_at: "2026-10-12T16:00:00.000Z" },
};

describe("agent normalization", () => {
  it.each([
    [undefined, "unknown"],
    ["", "unknown"],
    ["  ", "unknown"],
    ["!!!", "unknown"],
    ["Devin", "devin"],
    ["Claude Code", "claude-code"],
    ["GitHub Copilot (agent mode)", "github-copilot-agent-mode"],
    ["codex_cli v1.2", "codex_cli-v1.2"],
    ["--Cursor--", "cursor"],
    ["x".repeat(60), "x".repeat(40)],
    [`${"a".repeat(39)} b`, "a".repeat(39)],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeAgent(input)).toBe(expected);
  });

  it("validates agent in the run file and defaults it to unknown", () => {
    expect(runFileSchema.parse(run).agent).toBe("unknown");
    expect(runFileSchema.parse({ ...run, agent: "claude-code" }).agent).toBe(
      "claude-code",
    );
    expect(
      runFileSchema.safeParse({ ...run, agent: "Claude Code" }).success,
    ).toBe(false);
    expect(
      runFileSchema.safeParse({ ...run, agent: "a".repeat(41) }).success,
    ).toBe(false);
  });
});

describe("run file schema", () => {
  it("accepts a verified run and rejects unknown fields", () => {
    const verified = {
      ...run,
      result: {
        outcome: "partial",
        reasons: ["x"],
        verified_at: "2026-10-12T16:30:00.000Z",
        human_corrections: 1,
        human_minutes: 5,
      },
    };
    expect(runFileSchema.safeParse(verified).success).toBe(true);
    expect(runFileSchema.safeParse({ ...run, extra: true }).success).toBe(
      false,
    );
    expect(
      runFileSchema.safeParse({
        ...run,
        baseline: { ...run.baseline, commit: "nope" },
      }).success,
    ).toBe(false);
  });

  it("requires the exact verify result shape", () => {
    expect(
      verifyResultSchema.safeParse({ outcome: "pass", reasons: [] }).success,
    ).toBe(true);
    expect(
      verifyResultSchema.safeParse({ outcome: "ok", reasons: [] }).success,
    ).toBe(false);
    expect(
      verifyResultSchema.safeParse({ outcome: "pass", reasons: [], score: 1 })
        .success,
    ).toBe(false);
  });
});

describe("params and prompts", () => {
  const task = getTask("add-unit-test")!;

  it("parses and normalizes params", () => {
    expect(
      parseParams(task.manifest, [
        "file=./src\\utils\\format.ts",
        "function=formatPrice",
      ]),
    ).toEqual({ file: "src/utils/format.ts", function: "formatPrice" });
  });

  it.each([
    [
      ["file=src/a.ts"],
      /Missing required param\(s\): --param function=<identifier>/,
    ],
    [["file=src/a.ts", "function=a", "extra=1"], /Unknown param "extra"/],
    [["file=src/a.ts", "file=b.ts", "function=a"], /Duplicate param "file"/],
    [["file", "function=a"], /expected key=value/],
    [["file=../secret.ts", "function=a"], /Invalid value for param "file"/],
    [["file=/etc/passwd", "function=a"], /Invalid value/],
    [["file=C:\\x.ts", "function=a"], /Invalid value/],
    [["file=src/a.ts", "function=a-b"], /JavaScript identifier/],
    [["file=src/a.ts; rm -rf /", "function=a"], /Invalid value/],
  ])("rejects %j", (values, message) => {
    expect(() => parseParams(task.manifest, values)).toThrow(message);
  });

  it("accepts scoped packages and plugin rules", () => {
    const dep = getTask("dep-patch-bump")!;
    expect(parseParams(dep.manifest, ["package=@types/node"])).toEqual({
      package: "@types/node",
    });
    expect(() => parseParams(dep.manifest, ["package=Zod"])).toThrow(
      /npm package name/,
    );
    const lint = getTask("fix-lint-rule")!;
    expect(
      parseParams(lint.manifest, ["rule=@typescript-eslint/no-unused-vars"]),
    ).toEqual({ rule: "@typescript-eslint/no-unused-vars" });
  });

  it("renders fixed templates", () => {
    expect(
      renderPrompt("Test `{{function}}` in {{ file }}.", {
        file: "a.ts",
        function: "f",
      }),
    ).toBe("Test `f` in a.ts.");
  });

  it("rejects malformed manifests", () => {
    const manifest = { ...task.manifest, version: 0 };
    expect(taskManifestSchema.safeParse(manifest).success).toBe(false);
    expect(
      taskManifestSchema.safeParse({
        ...task.manifest,
        params: [task.manifest.params[0], task.manifest.params[0]],
      }).success,
    ).toBe(false);
  });
});
