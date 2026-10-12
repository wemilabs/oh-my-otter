import { describe, expect, it } from "vitest";
import {
  aggregateReports,
  BUILTIN_TASK_IDS,
  median,
  MIN_SAMPLE,
  summarize,
  type ReportPayload,
} from "../src/report";
import type { AgentsFile } from "../src/report";

const agents: AgentsFile = {
  agents: [
    { id: "claude-code", display_name: "Claude Code", aliases: ["claude"] },
    { id: "codex", display_name: "Codex", aliases: ["codex-cli"] },
  ],
};

function report(overrides: Partial<ReportPayload> = {}): ReportPayload {
  return {
    schema_version: 1,
    cli_version: "0.3.0",
    scoring_version: 1,
    task_id: "add-unit-test",
    task_version: 1,
    agent: "claude-code",
    outcome: "pass",
    human_corrections: 1,
    human_minutes: 10,
    attempts: 1,
    readiness_score: 80,
    checks: {},
    stack: {
      package_manager: "npm",
      language: "typescript",
      framework: "node",
    },
    submitted_on: "2026-10-10",
    ...overrides,
  };
}

describe("median", () => {
  it("handles odd, even, and empty input", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 4, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("summarize", () => {
  it("suppresses every metric below MIN_SAMPLE", () => {
    const stats = summarize([report(), report(), report(), report()]);
    expect(stats.n).toBe(4);
    expect(stats.enough).toBe(false);
    expect(stats.pass_rate).toBeNull();
    expect(stats.median_minutes).toBeNull();
    expect(stats.mean_attempts).toBeNull();
  });

  it("computes rates and medians at MIN_SAMPLE", () => {
    const reports = [
      report({ outcome: "pass", human_corrections: 0, human_minutes: 5 }),
      report({ outcome: "pass", human_corrections: 1, human_minutes: 10 }),
      report({
        outcome: "partial",
        human_corrections: 3,
        human_minutes: 15,
        attempts: 2,
      }),
      report({ outcome: "fail", human_corrections: 5, human_minutes: 20 }),
      report({ outcome: "pass", human_corrections: 2, human_minutes: 25 }),
    ];
    const stats = summarize(reports);
    expect(stats.n).toBe(MIN_SAMPLE);
    expect(stats.enough).toBe(true);
    expect(stats.pass_rate).toBeCloseTo(3 / 5);
    expect(stats.partial_rate).toBeCloseTo(1 / 5);
    expect(stats.fail_rate).toBeCloseTo(1 / 5);
    expect(stats.median_corrections).toBe(2);
    expect(stats.median_minutes).toBe(15);
    expect(stats.median_attempts).toBe(1);
    expect(stats.mean_attempts).toBe(1.2);
  });
});

describe("aggregateReports", () => {
  it("assigns readiness bands by score boundaries", () => {
    for (const [score, band] of [
      [59, "D"],
      [60, "C"],
      [74, "C"],
      [75, "B"],
      [89, "B"],
      [90, "A"],
    ] as const) {
      const aggregate = aggregateReports(
        [report({ readiness_score: score })],
        agents,
      );
      const group = aggregate.by_band.find((g) => g.key === band)!;
      expect(group.stats.n).toBe(1);
      for (const other of aggregate.by_band) {
        if (other.key !== band) expect(other.stats.n).toBe(0);
      }
    }
  });

  it("maps aliases to canonical agents and puts other last unranked", () => {
    const reports = [
      ...Array.from({ length: 5 }, () => report({ agent: "claude" })),
      report({ agent: "codex-cli" }),
      report({ agent: "unknown" }),
      report({ agent: "my-custom-agent" }),
    ];
    const aggregate = aggregateReports(reports, agents);
    const claude = aggregate.by_agent.find((g) => g.key === "claude-code")!;
    expect(claude.stats.n).toBe(5);
    expect(claude.label).toBe("Claude Code");
    expect(claude.ranked).toBe(true);
    const other = aggregate.by_agent.at(-1)!;
    expect(other.key).toBe("other");
    expect(other.label).toBe("Other");
    expect(other.ranked).toBe(false);
    expect(other.stats.n).toBe(2);
  });

  it("includes every builtin task even with no reports", () => {
    const aggregate = aggregateReports([], agents);
    expect(aggregate.by_task.map((g) => g.key)).toEqual([...BUILTIN_TASK_IDS]);
    for (const group of aggregate.by_task) {
      expect(group.stats.n).toBe(0);
      expect(group.stats.enough).toBe(false);
    }
    expect(aggregate.total).toBe(0);
    expect(aggregate.latest_submitted_on).toBeNull();
  });

  it("groups agent versions and models with unspecified and suppression", () => {
    const reports = [
      ...Array.from({ length: 5 }, () =>
        report({ agent: "claude-code", agent_version: "2.1.0" }),
      ),
      report({ agent: "claude-code", model: "opus" }),
    ];
    const aggregate = aggregateReports(reports, agents);
    const claude = aggregate.by_agent.find((g) => g.key === "claude-code")!;
    const version = claude.versions.find((g) => g.key === "2.1.0")!;
    expect(version.stats.n).toBe(5);
    expect(version.stats.pass_rate).toBe(1);
    const unspecified = claude.versions.find((g) => g.key === "unspecified")!;
    expect(unspecified.stats.n).toBe(1);
    expect(unspecified.stats.enough).toBe(false);
    const model = claude.models.find((g) => g.key === "opus")!;
    expect(model.stats.n).toBe(1);
    expect(model.stats.pass_rate).toBeNull();
  });

  it("computes per-task band and agent aggregates", () => {
    const reports = [
      ...Array.from({ length: 5 }, () =>
        report({ task_id: "dep-patch-bump", readiness_score: 95 }),
      ),
      report({ task_id: "dep-patch-bump", readiness_score: 40 }),
    ];
    const aggregate = aggregateReports(reports, agents);
    const bands = aggregate.by_task_band["dep-patch-bump"]!;
    expect(bands.find((g) => g.key === "A")!.stats.n).toBe(5);
    expect(bands.find((g) => g.key === "D")!.stats.n).toBe(1);
    const taskAgents = aggregate.by_task_agent["dep-patch-bump"]!;
    expect(taskAgents[0]!.key).toBe("claude-code");
    expect(taskAgents[0]!.stats.n).toBe(6);
  });
});
