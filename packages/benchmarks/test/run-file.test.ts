import { mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendVerification,
  readRunFile,
  updateRunFile,
  writeRunFile,
  type RunFile,
  type Verification,
} from "../src/index";
import { createRepo } from "./helpers";

const legacyRun = {
  schema_version: 1,
  task: { id: "add-unit-test", version: 1 },
  params: { file: "src/math.ts", function: "add" },
  agent: "cursor",
  baseline: {
    commit: "a".repeat(40),
    started_at: "2026-10-12T16:00:00.000Z",
    data: { old: true },
  },
} as const;

describe("run file migration", () => {
  it.each([
    ["without a result", legacyRun],
    [
      "with a result",
      {
        ...legacyRun,
        result: {
          outcome: "partial",
          reasons: ["First attempt"],
          verified_at: "2026-10-12T16:30:00.000Z",
          human_corrections: 1,
          human_minutes: 5,
        },
      },
    ],
  ])(
    "migrates the 0.2.0 schema-1 fixture %s in memory and on write",
    async (_, oldRun) => {
      const root = await createRepo({
        "src/math.ts": "export const add = 1;\n",
      });
      await mkdir(path.join(root, ".omot"));
      await writeFile(
        path.join(root, ".omot/run.json"),
        `${JSON.stringify(oldRun)}\n`,
      );

      const migrated = await readRunFile(root);
      expect(migrated.schema_version).toBe(2);
      expect(migrated.baseline.scripts).toBeUndefined();
      if ("result" in oldRun) {
        expect(migrated.verifications).toHaveLength(1);
        expect(migrated.result?.attempts).toBe(1);
        expect(migrated.verifications[0]).toMatchObject({
          outcome: "partial",
          reasons: ["First attempt"],
          agent: "cursor",
        });
      } else {
        expect(migrated.verifications).toEqual([]);
        expect(migrated.result).toBeUndefined();
      }

      await writeRunFile(root, migrated);
      const saved = JSON.parse(
        await readFile(path.join(root, ".omot/run.json"), "utf8"),
      );
      expect(saved.schema_version).toBe(2);
      expect(saved.verifications).toHaveLength("result" in oldRun ? 1 : 0);
      if (saved.result) expect(saved.result.attempts).toBe(1);
    },
  );

  it("appends attempts and keeps result equal to the latest verification", () => {
    let run = {
      schema_version: 2,
      task: { id: "add-unit-test", version: 1 },
      params: {},
      agent: "cursor",
      baseline: {
        commit: "a".repeat(40),
        started_at: "2026-10-12T16:00:00.000Z",
        data: { fixture: true },
      },
      verifications: [],
    } as RunFile;

    run = appendVerification(run, {
      verified_at: "2026-10-12T16:30:00.000Z",
      head_commit: "b".repeat(40),
      outcome: "partial",
      reasons: ["First"],
      human_corrections: 0,
      human_minutes: 0,
      agent: "cursor",
    });
    run = appendVerification(run, {
      verified_at: "2026-10-12T17:00:00.000Z",
      head_commit: "c".repeat(40),
      outcome: "pass",
      reasons: ["Second"],
      human_corrections: 2,
      human_minutes: 10,
      agent: "cursor",
    });

    expect(run.verifications).toHaveLength(2);
    expect(run.verifications.map(({ head_commit }) => head_commit)).toEqual([
      "b".repeat(40),
      "c".repeat(40),
    ]);
    expect(run.result).toMatchObject({
      outcome: "pass" as const,
      reasons: ["Second"],
      verified_at: "2026-10-12T17:00:00.000Z",
      attempts: 2,
    });
  });

  it("preserves updates from concurrent writers", async () => {
    const root = await createRepo({
      "src/math.ts": "export const add = 1;\n",
    });
    await writeRunFile(root, {
      schema_version: 2,
      task: { id: "add-unit-test", version: 3 },
      params: {},
      agent: "cursor",
      baseline: {
        commit: "a".repeat(40),
        started_at: "2026-10-12T16:00:00.000Z",
      },
      verifications: [],
    });
    const entries: Verification[] = [1, 2].map((index) => ({
      verified_at: `2026-10-12T16:3${index}:00.000Z`,
      head_commit: String(index).repeat(40),
      outcome: "pass",
      reasons: [`Attempt ${index}`],
      human_corrections: 0,
      human_minutes: 0,
      agent: "cursor",
    }));

    await Promise.all(
      entries.map((entry) =>
        updateRunFile(root, (run) => appendVerification(run, entry)),
      ),
    );

    const saved = await readRunFile(root);
    expect(saved.verifications).toHaveLength(2);
    expect(saved.result?.attempts).toBe(2);
  });

  it("removes stale locks and releases the lock after updater errors", async () => {
    const root = await createRepo({
      "src/math.ts": "export const add = 1;\n",
    });
    const run: RunFile = {
      schema_version: 2,
      task: { id: "add-unit-test", version: 3 },
      params: {},
      agent: "cursor",
      baseline: {
        commit: "a".repeat(40),
        started_at: "2026-10-12T16:00:00.000Z",
      },
      verifications: [],
    };
    await writeRunFile(root, run);
    const lock = path.join(root, ".omot/run.json.lock");
    await writeFile(lock, "stale");
    const stale = new Date(Date.now() - 61_000);
    await utimes(lock, stale, stale);
    await updateRunFile(root, (current) => current);
    await expect(readFile(lock, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });

    await expect(
      updateRunFile(root, () => {
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    await expect(readFile(lock, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
