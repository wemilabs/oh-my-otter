import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import { badgeMarkdown, main } from "../src/cli";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../checks/test/fixtures",
);
const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "omot-cli-"));
  tempDirs.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function invoke(
  argv: string[],
  options: {
    cwd?: string;
    isTTY?: boolean;
    confirm?: (question: string) => Promise<boolean>;
  } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  let output = "";
  let errors = "";
  const code = await main(argv, {
    cwd: options.cwd ?? process.cwd(),
    isTTY: options.isTTY ?? false,
    ...(options.confirm ? { confirm: options.confirm } : {}),
    stdout: (text) => {
      output += text;
    },
    stderr: (text) => {
      errors += text;
    },
  });
  return { code, stdout: output, stderr: errors };
}

function fixture(name: string): string {
  return path.join(fixtures, name);
}

describe("scan command", () => {
  it.each([
    ["healthy", 100, "A"],
    ["bare", 3, "D"],
    ["monorepo", 81, "B"],
  ] as const)(
    "prints JSON score for %s fixture",
    async (name, score, grade) => {
      const result = await invoke(["scan", fixture(name), "--json"]);
      const report = JSON.parse(result.stdout) as {
        score: number;
        grade: string;
      };
      expect(result.code).toBe(0);
      expect(report.score).toBe(score);
      expect(report.grade).toBe(grade);
      expect(result.stderr).toBe("");
    },
  );

  it("routes an empty command and --json through the default scan", async () => {
    const noArgs = await invoke([], { cwd: fixture("healthy") });
    const withFlag = await invoke(["--json"], { cwd: fixture("healthy") });
    expect(noArgs.stdout).toContain("Score: 100");
    expect(JSON.parse(withFlag.stdout).score).toBe(100);
  });

  it("enforces min-score and rejects invalid values", async () => {
    const monorepo = fixture("monorepo");
    expect((await invoke(["scan", monorepo, "--min-score", "90"])).code).toBe(
      1,
    );
    expect((await invoke(["scan", monorepo, "--min-score", "50"])).code).toBe(
      0,
    );
    const invalid = await invoke(["scan", monorepo, "--min-score", "abc"]);
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toContain("Invalid --min-score");
  });

  it("returns a tool error for missing paths", async () => {
    const result = await invoke(["scan", "/path/that/does/not/exist"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Path does not exist");
  });

  it("supports the hidden init command and keeps it out of help", async () => {
    const scan = await invoke(["scan", fixture("healthy"), "--json"]);
    const init = await invoke(["init", fixture("healthy"), "--json"]);
    expect(JSON.parse(init.stdout).score).toBe(JSON.parse(scan.stdout).score);
    const help = await invoke(["--help"]);
    expect(help.stdout).toContain("Oh My Otter is unofficial and independent.");
    expect(help.stdout).toContain("scan");
    expect(help.stdout).not.toContain("init");
  });

  it("prints a badge and formats its URL by grade", async () => {
    expect(badgeMarkdown(82, "B")).toBe(
      "![agent-ready](https://img.shields.io/badge/agent--ready-82%20%C2%B7%20B-green)",
    );
    expect(badgeMarkdown(100, "A")).toContain("-brightgreen)");
    expect(badgeMarkdown(74, "C")).toContain("-yellow)");
    expect(badgeMarkdown(20, "D")).toContain("-red)");
    const result = await invoke(["scan", fixture("monorepo"), "--badge"]);
    expect(result.stdout).toContain(badgeMarkdown(81, "B"));
  });

  it("produces a human report for a scan", async () => {
    const result = await invoke(["scan", fixture("monorepo")]);
    expect(result.stdout).toContain("Score: 81 · B (scoring v1)");
    expect(
      result.stdout.replaceAll("\u001b[31m", "").replaceAll("\u001b[39m", ""),
    ).toContain("✗ ci-config");
    expect(result.stdout).toContain("Hint: use --fix");
  });
});

describe("checks command", () => {
  it("lists all fourteen built-ins with weights", async () => {
    const result = await invoke(["checks", fixture("healthy"), "--json"]);
    const output = JSON.parse(result.stdout) as {
      checks: Array<{ id: string; weight: number; source: string }>;
    };
    expect(output.checks).toHaveLength(14);
    expect(
      output.checks.find((check) => check.id === "test-script")?.weight,
    ).toBe(5);
    expect(output.checks.every((check) => check.source === "builtin")).toBe(
      true,
    );
  });

  it("includes checks from a CLI plugin and reports its source", async () => {
    const root = await tempDir();
    const plugin = path.join(root, "plugin.ts");
    await writeFile(
      plugin,
      `export default [{id:"custom-check",title:"Custom",category:"setup",weight:1,why:"It helps agents.",run:async()=>({status:"pass"})}];\n`,
    );
    const result = await invoke([
      "checks",
      fixture("healthy"),
      "--plugin",
      plugin,
      "--json",
    ]);
    const output = JSON.parse(result.stdout) as {
      checks: Array<{ id: string; source: string }>;
    };
    const custom = output.checks.find((check) => check.id === "custom-check");
    expect(custom?.source).toBe(plugin);
    expect(output.checks).toHaveLength(15);
  });
});

describe("fix flow", () => {
  async function bareCopy(): Promise<string> {
    const root = await tempDir();
    await cp(fixture("bare"), root, { recursive: true });
    return root;
  }

  it("creates missing files without overwriting an existing file", async () => {
    const root = await bareCopy();
    await writeFile(path.join(root, ".nvmrc"), "custom\n");
    const result = await invoke(["scan", root, "--fix", "--yes", "--json"]);
    const report = JSON.parse(result.stdout) as {
      fixes: {
        planned: string[];
        created: string[];
        skipped: string[];
        applied: boolean;
      };
    };
    expect(result.code).toBe(0);
    expect(report.fixes.planned).not.toContain(".nvmrc");
    expect(await readFile(path.join(root, ".nvmrc"), "utf8")).toBe("custom\n");
    expect(report.fixes.created.length).toBeGreaterThan(0);
    expect(report.fixes.applied).toBe(true);
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain(
      "Agent instructions",
    );
  });

  it("reports JSON fix plans as unapplied without --yes", async () => {
    const root = await bareCopy();
    const result = await invoke(["scan", root, "--fix", "--json"]);
    const report = JSON.parse(result.stdout) as {
      fixes: {
        planned: string[];
        created: string[];
        skipped: string[];
        applied: boolean;
      };
    };

    expect(report.fixes.planned.length).toBeGreaterThan(0);
    expect(report.fixes.created).toEqual([]);
    expect(report.fixes.applied).toBe(false);
    expect(result.stderr).toBe(
      "Fixes not applied in --json mode; re-run with --yes to create them.\n",
    );
    await expect(
      readFile(path.join(root, "AGENTS.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not apply fixes when a TTY confirmation is declined", async () => {
    const root = await bareCopy();
    let question = "";
    const result = await invoke(["scan", root, "--fix"], {
      isTTY: true,
      confirm: async (prompt) => {
        question = prompt;
        return false;
      },
    });
    expect(question).toBe("Create 4 file(s)?");
    expect(result.stdout).toContain("--- /dev/null");
    expect(
      await readFile(path.join(root, ".nvmrc")).catch(() => null),
    ).toBeNull();
    expect(
      await readFile(path.join(root, "AGENTS.md")).catch(() => null),
    ).toBeNull();
  });

  it("prints the scan report and badge before fix previews and created files", async () => {
    const root = await bareCopy();
    const result = await invoke(["scan", root, "--fix", "--yes", "--badge"]);
    const reportIndex = result.stdout.indexOf("Score:");
    const badgeIndex = result.stdout.indexOf("![agent-ready]");
    const previewIndex = result.stdout.indexOf("--- /dev/null");
    const createdIndex = result.stdout.indexOf("Created:");

    expect(result.code).toBe(0);
    expect(reportIndex).toBeGreaterThanOrEqual(0);
    expect(reportIndex).toBeLessThan(badgeIndex);
    expect(badgeIndex).toBeLessThan(previewIndex);
    expect(previewIndex).toBeLessThan(createdIndex);
  });

  it("does not apply fixes without --yes when output is not a TTY", async () => {
    const root = await bareCopy();
    const result = await invoke(["scan", root, "--fix"], { isTTY: false });
    expect(result.stdout).toContain("re-run with --yes");
    expect(
      await readFile(path.join(root, ".nvmrc")).catch(() => null),
    ).toBeNull();
  });
});

describe("plugins and config", () => {
  it("resolves ESM-only plugin packages", async () => {
    const root = await tempDir();
    const pluginRoot = path.join(root, "node_modules/esm-only-plugin");
    await mkdir(pluginRoot, { recursive: true });
    await writeFile(
      path.join(pluginRoot, "package.json"),
      JSON.stringify({
        name: "esm-only-plugin",
        type: "module",
        exports: { ".": { import: "./index.js" } },
      }),
    );
    await writeFile(
      path.join(pluginRoot, "index.js"),
      `export default [{id:"esm-plugin-check",title:"ESM plugin",category:"docs",weight:1,why:"It helps agents.",run:async()=>({status:"pass"})}];\n`,
    );

    const result = await invoke([
      "scan",
      root,
      "--plugin",
      "esm-only-plugin",
      "--json",
    ]);
    const output = JSON.parse(result.stdout) as {
      checks: Array<{ id: string }>;
    };

    expect(result.code).toBe(0);
    expect(output.checks.some((check) => check.id === "esm-plugin-check")).toBe(
      true,
    );
  });

  it("loads .ts and .mjs plugins", async () => {
    const root = await tempDir();
    const typescriptPlugin = path.join(root, "plugin.ts");
    const modulePlugin = path.join(root, "plugin.mjs");
    const pluginBody = `export default [{id:"plugin-check",title:"Plugin",category:"docs",weight:1,why:"It helps agents.",run:async()=>({status:"pass"})}];\n`;
    await writeFile(typescriptPlugin, pluginBody);
    await writeFile(modulePlugin, pluginBody);
    const tsResult = await invoke([
      "checks",
      fixture("healthy"),
      "--plugin",
      typescriptPlugin,
      "--json",
    ]);
    const mjsResult = await invoke([
      "checks",
      fixture("healthy"),
      "--plugin",
      modulePlugin,
      "--json",
    ]);
    expect(JSON.parse(tsResult.stdout).checks).toHaveLength(15);
    expect(JSON.parse(mjsResult.stdout).checks).toHaveLength(15);
  });

  it("loads a config plugin relative to the config file", async () => {
    const root = await tempDir();
    await writeFile(
      path.join(root, "my-plugin.ts"),
      `export default [{id:"config-check",title:"Config check",category:"docs",weight:1,why:"It helps agents.",run:async()=>({status:"pass"})}];\n`,
    );
    await writeFile(
      path.join(root, "omot.config.ts"),
      `export default {plugins:["./my-plugin.ts"]};\n`,
    );
    const result = await invoke(["checks", root, "--json"]);
    const output = JSON.parse(result.stdout) as {
      checks: Array<{ id: string; source: string }>;
    };
    expect(
      output.checks.find((check) => check.id === "config-check")?.source,
    ).toContain("my-plugin.ts");
  });

  it("rejects malformed and duplicate plugin checks with clear errors", async () => {
    const root = await tempDir();
    const malformed = path.join(root, "malformed.ts");
    const duplicate = path.join(root, "duplicate.ts");
    await writeFile(
      malformed,
      `export default [{id:"bad-check",title:"Bad",category:"docs",weight:9,why:"Bad.",run:async()=>({status:"pass"})}];\n`,
    );
    await writeFile(
      duplicate,
      `export default [{id:"test-script",title:"Duplicate",category:"docs",weight:1,why:"Duplicate.",run:async()=>({status:"pass"})}];\n`,
    );
    const malformedResult = await invoke([
      "checks",
      fixture("healthy"),
      "--plugin",
      malformed,
    ]);
    expect(malformedResult.code).toBe(1);
    expect(malformedResult.stderr).toContain("weight");
    const duplicateResult = await invoke([
      "checks",
      fixture("healthy"),
      "--plugin",
      duplicate,
    ]);
    expect(duplicateResult.code).toBe(1);
    expect(duplicateResult.stderr).toContain(
      'Duplicate check id "test-script"',
    );
  });
});

describe("CLI executable", () => {
  it("scans the healthy fixture from the built binary", async () => {
    const result = await execa(
      "node",
      ["dist/bin.js", "scan", fixture("healthy"), "--json"],
      { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") },
    );
    expect(JSON.parse(result.stdout).score).toBe(100);
  });
});
