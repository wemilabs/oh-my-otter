import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDataset,
  loadReports,
  DEFAULT_DATASET_URL,
} from "../src/lib/dataset";

const dirs: string[] = [];
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureUrl = pathToFileURL(
  path.join(here, "fixtures", "reports.ndjson"),
).href;

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function fakeFetch(status: number, body = "") {
  return vi.fn(
    async () => new Response(body, { status }),
  ) as unknown as typeof fetch;
}

describe("loadReports", () => {
  it("treats an empty body as empty", async () => {
    const load = await loadReports({ fetchImpl: fakeFetch(200, "  \n\n") });
    expect(load.status).toBe("empty");
    expect(load.reports).toEqual([]);
  });

  it("treats a 404 as empty", async () => {
    const load = await loadReports({ fetchImpl: fakeFetch(404) });
    expect(load.status).toBe("empty");
  });

  it("treats a 500 as unavailable and warns without a body", async () => {
    const warn = vi.fn();
    const load = await loadReports({
      fetchImpl: fakeFetch(500, "server exploded with secret details"),
      warn,
    });
    expect(load.status).toBe("unavailable");
    expect(warn).toHaveBeenCalledOnce();
    const msg = String(warn.mock.calls[0]?.[0]);
    expect(msg).toContain("500");
    expect(msg).not.toContain("secret details");
  });

  it("treats a thrown fetch as unavailable", async () => {
    const warn = vi.fn();
    const load = await loadReports({
      fetchImpl: vi.fn(async () => {
        throw new Error("connection refused");
      }) as unknown as typeof fetch,
      warn,
    });
    expect(load.status).toBe("unavailable");
    expect(String(warn.mock.calls[0]?.[0])).toContain("connection refused");
  });

  it("treats a failing body read as unavailable", async () => {
    const warn = vi.fn();
    const load = await loadReports({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => {
          throw new Error("stream terminated early");
        },
      })) as unknown as typeof fetch,
      warn,
    });
    expect(load.status).toBe("unavailable");
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      "stream terminated early",
    );
  });

  it("skips invalid lines and warns once per line number", async () => {
    const warn = vi.fn();
    const load = await loadReports({ url: fixtureUrl, warn });
    expect(load.status).toBe("ok");
    expect(load.reports).toHaveLength(14);
    expect(load.invalid).toEqual([15, 16]);
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages).toContain("skipping invalid dataset line 15");
    expect(messages).toContain("skipping invalid dataset line 16");
  });

  it("reads the file:// fixture with the right counts", async () => {
    const load = await loadReports({ url: fixtureUrl });
    expect(load.status).toBe("ok");
    expect(load.reports.every((r) => r.schema_version === 1)).toBe(true);
    expect(new Set(load.reports.map((r) => r.task_id)).size).toBeGreaterThan(3);
  });

  it("treats a missing file:// path as empty", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "omot-web-ds-"));
    dirs.push(dir);
    const load = await loadReports({
      url: pathToFileURL(path.join(dir, "nope.ndjson")).href,
    });
    expect(load.status).toBe("empty");
  });

  it("fetches the default dataset URL", async () => {
    const spy = fakeFetch(404);
    await loadReports({ fetchImpl: spy });
    expect(spy).toHaveBeenCalledWith(DEFAULT_DATASET_URL);
  });

  it("honours OMOT_DATASET_URL when no url is given", async () => {
    vi.stubEnv("OMOT_DATASET_URL", fixtureUrl);
    const load = await loadReports();
    expect(load.status).toBe("ok");
  });

  it("treats a non-ENOENT file error as unavailable", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "omot-web-ds-"));
    dirs.push(dir);
    // A directory path fails with EISDIR, not ENOENT.
    const load = await loadReports({
      url: pathToFileURL(dir).href,
      warn: vi.fn(),
    });
    expect(load.status).toBe("unavailable");
  });
});

describe("buildDataset", () => {
  it("aggregates loaded reports with the agents file", async () => {
    const text = await readFile(fileURLToPath(fixtureUrl), "utf8");
    const { parseReportsNdjson } =
      await import("@oh-my-otter/benchmarks/report");
    const load = {
      status: "ok" as const,
      reports: parseReportsNdjson(text).reports,
      invalid: [],
    };
    const { dataset, aggregate } = buildDataset(load);
    expect(dataset.status).toBe("ok");
    expect(dataset.reports.length).toBe(load.reports.length);
    expect(dataset.agents.agents.length).toBeGreaterThan(0);
    expect(aggregate.overall.n).toBe(load.reports.length);
  });
});
