import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyFixPlan, createCheckContext, planFixes } from "../src/node";
import { RunDisabledError } from "../src/runner";

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "omot-core-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("createCheckContext", () => {
  it("reads existing files and returns null for missing files", async () => {
    const root = await tempDir();
    await writeFile(path.join(root, "hello.txt"), "hello");
    const ctx = createCheckContext(root);
    expect(await ctx.read("hello.txt")).toBe("hello");
    expect(await ctx.read("missing.txt")).toBeNull();
    expect(await ctx.exists("missing.txt")).toBe(false);
  });

  it("globs files while excluding node_modules", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "node_modules/pkg"), { recursive: true });
    await writeFile(path.join(root, "src.js"), "");
    await writeFile(path.join(root, "node_modules/pkg/hidden.js"), "");
    expect(await createCheckContext(root).glob("**/*.js")).toEqual(["src.js"]);
  });

  it("loads package.json lazily, freezes it, and returns null when invalid or missing", async () => {
    const root = await tempDir();
    const ctx = createCheckContext(root);
    await writeFile(
      path.join(root, "package.json"),
      '{"name":"lazy","nested":{"ok":true}}',
    );
    const pkg = ctx.packageJson;
    expect(pkg?.name).toBe("lazy");
    expect(Object.isFrozen(pkg)).toBe(true);
    expect(Object.isFrozen(pkg?.nested)).toBe(true);
    await writeFile(path.join(root, "package.json"), "invalid");
    expect(ctx.packageJson).toBe(pkg);

    const noPackageRoot = await tempDir();
    expect(createCheckContext(noPackageRoot).packageJson).toBeNull();
  });

  it("throws when commands are disabled and returns the process exit code when enabled", async () => {
    const root = await tempDir();
    await expect(
      createCheckContext(root).run('node -e "process.exit(3)"'),
    ).rejects.toBeInstanceOf(RunDisabledError);
    await expect(
      createCheckContext(root, { allowRun: true }).run(
        'node -e "process.exit(3)"',
      ),
    ).resolves.toEqual({ code: 3 });
  });

  it("rejects paths escaping the root", async () => {
    const root = await tempDir();
    const ctx = createCheckContext(root);
    await expect(ctx.read("../escape.txt")).rejects.toThrow(
      "Path escapes repository root",
    );
    await expect(ctx.exists("../escape.txt")).rejects.toThrow(
      "Path escapes repository root",
    );
  });
});

describe("fix plans", () => {
  it("creates nested files and never overwrites existing files", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "existing"), { recursive: true });
    await writeFile(path.join(root, "existing/file.txt"), "custom\n");
    const plan = [
      { path: "nested/deep/file.txt", contents: "created" },
      { path: "existing/file.txt", contents: "replacement" },
    ];
    expect(await planFixes(root, plan)).toEqual({
      created: ["nested/deep/file.txt"],
      skipped: ["existing/file.txt"],
    });
    expect(await applyFixPlan(root, plan)).toEqual({
      created: ["nested/deep/file.txt"],
      skipped: ["existing/file.txt"],
    });
    expect(
      await readFile(path.join(root, "nested/deep/file.txt"), "utf8"),
    ).toBe("created");
    expect(await readFile(path.join(root, "existing/file.txt"), "utf8")).toBe(
      "custom\n",
    );
    await expect(
      applyFixPlan(root, [{ path: "../escape.txt", contents: "no" }]),
    ).rejects.toThrow("Path escapes repository root");
  });
});
