import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXAMPLE_REPORT_PAYLOAD } from "@oh-my-otter/benchmarks/report";
import { loadDataset } from "../src/lib/dataset";

const dirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function fakeRoot(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "omot-web-dataset-"));
  dirs.push(root);
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return root;
}

const agentsJson = JSON.stringify({
  agents: [{ id: "claude-code", display_name: "Claude Code", aliases: [] }],
});

describe("loadDataset", () => {
  it("keeps valid reports, skips invalid ones with a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = await fakeRoot({
      "pnpm-workspace.yaml": "packages: []\n",
      "dataset/agents.json": agentsJson,
      "dataset/reports/20261010T000000Z-aaaa1111.json": JSON.stringify(
        EXAMPLE_REPORT_PAYLOAD,
      ),
      "dataset/reports/20261011T000000Z-bbbb2222.json": "{broken json",
      "dataset/reports/20261012T000000Z-cccc3333.json": JSON.stringify({
        ...EXAMPLE_REPORT_PAYLOAD,
        outcome: "maybe",
      }),
      "dataset/reports/.gitkeep": "",
    });
    const dataset = loadDataset(root);
    expect(dataset.reports).toHaveLength(1);
    expect(dataset.reports[0]).toEqual(EXAMPLE_REPORT_PAYLOAD);
    expect(dataset.skipped).toBe(2);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain(
      "[dataset] skipping",
    );
    expect(dataset.agents.agents[0]?.id).toBe("claude-code");
  });

  it("handles a missing reports directory", async () => {
    const root = await fakeRoot({
      "dataset/agents.json": agentsJson,
    });
    const dataset = loadDataset(root);
    expect(dataset.reports).toEqual([]);
    expect(dataset.skipped).toBe(0);
  });
});
