import "server-only";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  agentsFileSchema,
  aggregateReports,
  reportPayloadSchema,
  type AgentsFile,
  type Aggregate,
  type ReportPayload,
} from "@oh-my-otter/benchmarks/report";

export interface Dataset {
  reports: ReportPayload[];
  agents: AgentsFile;
  skipped: number;
}

/** Walks up from `start` until it finds pnpm-workspace.yaml (the repo root). */
function findRepoRoot(start: string): string {
  let dir = path.resolve(start);
  while (true) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start, "../..");
    dir = parent;
  }
}

export function loadDataset(root?: string): Dataset {
  const repoRoot = root ? path.resolve(root) : findRepoRoot(process.cwd());
  const reportsDir = path.join(repoRoot, "dataset", "reports");

  const agents = agentsFileSchema.parse(
    JSON.parse(
      readFileSync(path.join(repoRoot, "dataset", "agents.json"), "utf8"),
    ),
  );

  let names: string[] = [];
  try {
    names = readdirSync(reportsDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    names = [];
  }

  const reports: ReportPayload[] = [];
  let skipped = 0;
  for (const name of names) {
    const file = path.join(reportsDir, name);
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      console.warn(
        `[dataset] skipping ${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
      skipped += 1;
      continue;
    }
    const parsed = reportPayloadSchema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      console.warn(
        `[dataset] skipping ${name}: ${issue ? `${issue.path.join(".") || "(root)"}: ${issue.message}` : "invalid payload"}`,
      );
      skipped += 1;
      continue;
    }
    reports.push(parsed.data);
  }
  return { reports, agents, skipped };
}

let cached: { dataset: Dataset; aggregate: Aggregate } | undefined;

export function getDataset(): { dataset: Dataset; aggregate: Aggregate } {
  cached ??= (() => {
    const dataset = loadDataset();
    return {
      dataset,
      aggregate: aggregateReports(dataset.reports, dataset.agents),
    };
  })();
  return cached;
}
