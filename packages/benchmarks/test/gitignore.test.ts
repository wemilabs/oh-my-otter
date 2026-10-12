import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyGitignore,
  planGitignore,
  readRunFile,
  writeRunFile,
} from "../src/index";
import { createRepo } from "./helpers";

describe(".gitignore handling", () => {
  it("creates .gitignore when absent", async () => {
    const root = await createRepo({ "a.txt": "a\n" });
    const plan = await planGitignore(root);
    expect(plan).toEqual({ action: "create", text: ".omot/\n" });
    await applyGitignore(root, plan);
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe(
      ".omot/\n",
    );
  });

  it("appends one line, preserving existing content and CRLF", async () => {
    const root = await createRepo({ ".gitignore": "node_modules\r\ndist" });
    const plan = await planGitignore(root);
    expect(plan).toEqual({ action: "append", text: "\r\n.omot/\r\n" });
    await applyGitignore(root, plan);
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe(
      "node_modules\r\ndist\r\n.omot/\r\n",
    );
  });

  it.each([".omot", "/.omot/", ".omot/**"])(
    "does nothing when %s is already ignored",
    async (line) => {
      const root = await createRepo({
        ".gitignore": `node_modules\n${line}\n`,
      });
      expect(await planGitignore(root)).toEqual({ action: "none" });
    },
  );

  it("skips a .gitignore that is not a regular file", async () => {
    const root = await createRepo({ "a.txt": "a\n" });
    await mkdir(path.join(root, ".gitignore"));
    expect((await planGitignore(root)).action).toBe("skip");
  });
});

describe("run file", () => {
  it("round-trips through .omot/run.json", async () => {
    const root = await createRepo({ "a.txt": "a\n" });
    await expect(readRunFile(root)).rejects.toThrow(/No benchmark run found/);
    const run = {
      schema_version: 1 as const,
      task: { id: "add-unit-test", version: 1 },
      params: { file: "a.ts", function: "a" },
      agent: "cursor",
      baseline: {
        commit: "b".repeat(40),
        started_at: "2026-10-12T16:00:00.000Z",
      },
    };
    await writeRunFile(root, run);
    expect(await readRunFile(root)).toEqual(run);
    await writeFile(path.join(root, ".omot/run.json"), '{"schema_version":2}');
    await expect(readRunFile(root)).rejects.toThrow(
      /Invalid \.omot\/run\.json/,
    );
  });
});
