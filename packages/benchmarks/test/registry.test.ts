import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { builtinTasks, taskManifestSchema } from "../src/index";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const tasksDir = path.join(packageRoot, "src/tasks");
const docsDir = path.resolve(packageRoot, "../../docs/benchmarks");

describe("task registry", () => {
  it("registers every task folder exactly once", async () => {
    const folders = (await readdir(tasksDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const ids = builtinTasks.map((task) => task.manifest.id).sort();
    expect(ids).toEqual(folders);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the six Phase 2 tasks", () => {
    expect(builtinTasks.map((task) => task.manifest.id)).toEqual([
      "dep-patch-bump",
      "add-unit-test",
      "fix-lint-rule",
      "a11y-img-alt",
      "ts-strict-file",
      "fix-failing-test",
    ]);
  });

  it.each(builtinTasks.map((task) => [task.manifest.id, task] as const))(
    "%s has task.json, prompt.md, verify.ts, and docs",
    async (id, task) => {
      const folder = path.join(tasksDir, id);
      expect((await readdir(folder)).sort()).toEqual([
        "prompt.md",
        "task.json",
        "verify.ts",
      ]);
      const manifest = taskManifestSchema.parse(
        JSON.parse(await readFile(path.join(folder, "task.json"), "utf8")),
      );
      expect(manifest.id).toBe(id);
      const docs = await readFile(path.join(docsDir, `${id}.md`), "utf8");
      expect(docs).toContain(`# ${id}`);
      expect(docs).toContain(`omot bench start ${id}`);
      for (const param of task.manifest.params)
        expect(docs).toContain(param.name);
    },
  );

  it.each(builtinTasks.map((task) => [task.manifest.id, task] as const))(
    "%s prompt is agent-neutral and uses its params",
    (id, task) => {
      expect(task.prompt).not.toMatch(/devin|claude|cursor|copilot|codex/i);
      // fix-failing-test deliberately hides which file holds the bug.
      if (id === "fix-failing-test") return;
      for (const param of task.manifest.params) {
        expect(task.prompt).toContain(`{{${param.name}}}`);
      }
    },
  );
});
