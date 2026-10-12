import "server-only";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { cacheLife, cacheTag } from "next/cache";
import {
  agentsFileSchema,
  aggregateReports,
  parseReportsNdjson,
  type AgentsFile,
  type Aggregate,
  type ReportPayload,
} from "@oh-my-otter/benchmarks/report";
import agentsJson from "../../../../dataset/agents.json";

export const DEFAULT_DATASET_URL =
  "https://raw.githubusercontent.com/wemilabs/oh-my-otter/dataset/reports.ndjson";

export interface DatasetLoad {
  status: "ok" | "empty" | "unavailable";
  reports: ReportPayload[];
  invalid: number[];
}

export interface Dataset {
  reports: ReportPayload[];
  agents: AgentsFile;
  status: DatasetLoad["status"];
  invalid: number[];
}

const agents = agentsFileSchema.parse(agentsJson);

const EMPTY: DatasetLoad = { status: "empty", reports: [], invalid: [] };
const UNAVAILABLE: DatasetLoad = {
  status: "unavailable",
  reports: [],
  invalid: [],
};

/**
 * Fetches `reports.ndjson` from the `dataset` branch. `file:` URLs are read
 * from disk for local development and tests. Always resolves; a bad upstream
 * yields "unavailable" rather than throwing.
 */
export async function loadReports(opts?: {
  url?: string;
  fetchImpl?: typeof fetch;
  warn?: (msg: string) => void;
}): Promise<DatasetLoad> {
  const url = opts?.url ?? process.env.OMOT_DATASET_URL ?? DEFAULT_DATASET_URL;
  const warn =
    opts?.warn ?? ((msg: string) => console.warn(`[dataset] ${msg}`));

  let text: string;
  if (url.startsWith("file:")) {
    try {
      text = await readFile(fileURLToPath(url), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return EMPTY;
      warn(
        `could not read ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return UNAVAILABLE;
    }
  } else {
    const fetchImpl = opts?.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(url);
    } catch (error) {
      warn(
        `could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return UNAVAILABLE;
    }
    if (response.status === 404) return EMPTY;
    if (!response.ok) {
      warn(`fetching ${url} failed with status ${response.status}`);
      return UNAVAILABLE;
    }
    try {
      text = await response.text();
    } catch (error) {
      warn(
        `could not read ${url} body: ${error instanceof Error ? error.message : String(error)}`,
      );
      return UNAVAILABLE;
    }
  }

  const { reports, invalid } = parseReportsNdjson(text);
  for (const line of invalid) {
    warn(`skipping invalid dataset line ${line}`);
  }
  return {
    status: reports.length === 0 ? "empty" : "ok",
    reports,
    invalid,
  };
}

/** Pure: combines a loader result with the canonical agents and aggregates. */
export function buildDataset(load: DatasetLoad): {
  dataset: Dataset;
  aggregate: Aggregate;
} {
  const dataset: Dataset = {
    reports: load.reports,
    agents,
    status: load.status,
    invalid: load.invalid,
  };
  return {
    dataset,
    aggregate: aggregateReports(dataset.reports, dataset.agents),
  };
}

export async function getDataset(): Promise<{
  dataset: Dataset;
  aggregate: Aggregate;
}> {
  "use cache";
  cacheLife("hours");
  cacheTag("dataset");
  const load = await loadReports();
  return buildDataset(load);
}
