import { gradeFor, type Grade } from "@oh-my-otter/core";
import { BUILTIN_TASK_IDS, BUILTIN_TASK_VERSIONS } from "./payload";
import type { ReportPayload } from "./payload";
import { canonicalAgent, OTHER_AGENT, type AgentsFile } from "./agents";

export const MIN_SAMPLE = 5;

export interface CellStats {
  n: number;
  enough: boolean;
  pass_rate: number | null;
  partial_rate: number | null;
  fail_rate: number | null;
  median_corrections: number | null;
  median_minutes: number | null;
  median_attempts: number | null;
  mean_attempts: number | null;
}

export interface Group<K extends string = string> {
  key: K;
  label: string;
  stats: CellStats;
}

export interface AgentGroup extends Group {
  ranked: boolean;
  versions: Group[];
  models: Group[];
}

export interface Aggregate {
  total: number;
  excluded_other_versions: number;
  overall: CellStats;
  by_task: Group[];
  by_band: Group<Grade>[];
  by_agent: AgentGroup[];
  by_task_band: Record<string, Group<Grade>[]>;
  by_task_agent: Record<string, AgentGroup[]>;
  latest_submitted_on: string | null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function summarize(reports: readonly ReportPayload[]): CellStats {
  const n = reports.length;
  const enough = n >= MIN_SAMPLE;
  if (!enough) {
    return {
      n,
      enough,
      pass_rate: null,
      partial_rate: null,
      fail_rate: null,
      median_corrections: null,
      median_minutes: null,
      median_attempts: null,
      mean_attempts: null,
    };
  }
  const passes = reports.filter((r) => r.outcome === "pass").length;
  const partials = reports.filter((r) => r.outcome === "partial").length;
  const fails = reports.filter((r) => r.outcome === "fail").length;
  const attempts = reports.map((r) => r.attempts);
  return {
    n,
    enough,
    pass_rate: passes / n,
    partial_rate: partials / n,
    fail_rate: fails / n,
    median_corrections: median(reports.map((r) => r.human_corrections)),
    median_minutes: median(reports.map((r) => r.human_minutes)),
    median_attempts: median(attempts),
    mean_attempts:
      Math.round((attempts.reduce((a, b) => a + b, 0) / n) * 100) / 100,
  };
}

function sortGroups(groups: Group[]): Group[] {
  return [...groups].sort(
    (a, b) => b.stats.n - a.stats.n || a.key.localeCompare(b.key),
  );
}

function dimensionGroups(
  reports: readonly ReportPayload[],
  pick: (report: ReportPayload) => string | undefined,
): Group[] {
  const buckets = new Map<string, ReportPayload[]>();
  for (const report of reports) {
    const key = pick(report) ?? "(none)";
    const bucket = buckets.get(key) ?? [];
    bucket.push(report);
    buckets.set(key, bucket);
  }
  return sortGroups(
    [...buckets.entries()].map(([key, bucket]) => ({
      key,
      label: key === "(none)" ? "not specified" : key,
      stats: summarize(bucket),
    })),
  );
}

function agentGroups(
  reports: readonly ReportPayload[],
  agents: AgentsFile,
): AgentGroup[] {
  const buckets = new Map<
    string,
    { label: string; reports: ReportPayload[] }
  >();
  for (const report of reports) {
    const id = canonicalAgent(report.agent, agents);
    let bucket = buckets.get(id);
    if (!bucket) {
      const label =
        id === OTHER_AGENT
          ? "Other"
          : (agents.agents.find((a) => a.id === id)?.display_name ?? id);
      bucket = { label, reports: [] };
      buckets.set(id, bucket);
    }
    bucket.reports.push(report);
  }
  const groups: AgentGroup[] = [...buckets.entries()].map(([id, bucket]) => ({
    key: id,
    label: bucket.label,
    stats: summarize(bucket.reports),
    ranked: id !== OTHER_AGENT,
    versions: dimensionGroups(bucket.reports, (r) => r.agent_version),
    models: dimensionGroups(bucket.reports, (r) => r.model),
  }));
  const rankedEnough = groups.filter((g) => g.ranked && g.stats.enough);
  const rankedSmall = groups.filter((g) => g.ranked && !g.stats.enough);
  const other = groups.filter((g) => !g.ranked);
  rankedEnough.sort(
    (a, b) =>
      (b.stats.pass_rate ?? 0) - (a.stats.pass_rate ?? 0) ||
      b.stats.n - a.stats.n ||
      a.key.localeCompare(b.key),
  );
  rankedSmall.sort(
    (a, b) => b.stats.n - a.stats.n || a.key.localeCompare(b.key),
  );
  return [...rankedEnough, ...rankedSmall, ...other];
}

const BANDS: Grade[] = ["A", "B", "C", "D"];

function bandGroups(reports: readonly ReportPayload[]): Group<Grade>[] {
  return BANDS.map((grade) => ({
    key: grade,
    label: grade,
    stats: summarize(
      reports.filter((r) => gradeFor(r.readiness_score) === grade),
    ),
  }));
}

export function aggregateReports(
  reports: readonly ReportPayload[],
  agents: AgentsFile,
): Aggregate {
  // Reports from other task versions measure different material and must not
  // share cells; only reports matching the current bundled version count.
  const current = reports.filter(
    (r) => r.task_version === BUILTIN_TASK_VERSIONS[r.task_id],
  );
  const byTaskBand: Record<string, Group<Grade>[]> = {};
  const byTaskAgent: Record<string, AgentGroup[]> = {};
  const byTask: Group[] = BUILTIN_TASK_IDS.map((id) => {
    const taskReports = current.filter((r) => r.task_id === id);
    byTaskBand[id] = bandGroups(taskReports);
    byTaskAgent[id] = agentGroups(taskReports, agents);
    return { key: id, label: id, stats: summarize(taskReports) };
  });
  return {
    total: current.length,
    excluded_other_versions: reports.length - current.length,
    overall: summarize(current),
    by_task: byTask,
    by_band: bandGroups(current),
    by_agent: agentGroups(current, agents),
    by_task_band: byTaskBand,
    by_task_agent: byTaskAgent,
    latest_submitted_on:
      current
        .map((r) => r.submitted_on)
        .sort()
        .at(-1) ?? null,
  };
}
