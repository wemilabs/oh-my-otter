import { describe, expect, it } from "vitest";
import { builtinChecks } from "@oh-my-otter/checks";
import { defineCheck, type Check } from "@oh-my-otter/core";
import { buildCheckCatalog, gradeBands } from "../src/lib/checks";

describe("buildCheckCatalog", () => {
  it("describes every built-in in registry order", async () => {
    const catalog = await buildCheckCatalog();
    expect(catalog).toHaveLength(builtinChecks.length);
    expect(new Set(catalog.map((entry) => entry.id)).size).toBe(catalog.length);
    for (const [index, check] of builtinChecks.entries()) {
      expect(catalog[index]).toMatchObject({
        id: check.id,
        title: check.title,
        category: check.category,
        weight: check.weight,
        why: check.why,
      });
      expect(catalog[index]?.howToPass).not.toBeNull();
    }
    expect(
      catalog.find((entry) => entry.id === "gitignore-sane")?.fixCreates,
    ).toEqual([".gitignore"]);
    expect(
      catalog.find((entry) => entry.id === "test-script")?.fixCreates,
    ).toEqual([]);
  });

  it("does not invent passing guidance or fix files", async () => {
    const check = defineCheck({
      id: "always-passes",
      title: "Always passes",
      category: "setup",
      weight: 1,
      why: "A passing probe needs no instructions.",
      async run() {
        return { status: "pass" };
      },
    });
    await expect(buildCheckCatalog([check])).resolves.toMatchObject([
      { howToPass: null, fixCreates: [] },
    ]);
  });

  it("stubs command execution with a failing result", async () => {
    let code: number | undefined;
    const check: Check = {
      id: "probe-run",
      title: "Probe run",
      category: "verification",
      weight: 1,
      why: "Probe commands are never executed.",
      async run(ctx) {
        const result = await ctx.run("this command is not executed");
        code = result.code;
        return {
          status: "fail",
          fix: `Command result code ${result.code}.`,
        };
      },
    };
    await buildCheckCatalog([check]);
    expect(code).toBe(1);
  });

  it("uses matching Markdown files to derive guidance from the empty probe", async () => {
    const probes: Array<{ source: string; matches: string[] }> = [];
    const check: Check = {
      id: "markdown-glob",
      title: "Find Markdown files",
      category: "docs",
      weight: 1,
      why: "A Markdown file documents the repository.",
      async run(ctx) {
        const matches = await ctx.glob("**/*.md");
        const source = ctx.packageJson ? "bare" : "empty";
        probes.push({ source, matches });
        return matches.length === 0
          ? {
              status: "fail",
              fix: `Add a Markdown file for the ${source} probe.`,
            }
          : { status: "pass" };
      },
    };

    const [entry] = await buildCheckCatalog([check]);
    expect(entry?.howToPass).toBe("Add a Markdown file for the empty probe.");
    expect(probes).toEqual([
      { source: "empty", matches: [] },
      { source: "bare", matches: [] },
    ]);
  });

  it("matches probe paths against the requested glob", async () => {
    const probes: Array<{ source: string; matches: string[] }> = [];
    const check: Check = {
      id: "typescript-glob",
      title: "Find TypeScript files",
      category: "verification",
      weight: 1,
      why: "The source file should match a TypeScript glob.",
      async run(ctx) {
        const matches = await ctx.glob("src/**/*.ts");
        probes.push({
          source: ctx.packageJson ? "bare" : "empty",
          matches,
        });
        return matches.includes("src/index.ts")
          ? { status: "pass" }
          : { status: "fail", fix: "Restore src/index.ts." };
      },
    };

    const [entry] = await buildCheckCatalog([check]);
    expect(entry?.howToPass).toBe("Restore src/index.ts.");
    expect(probes).toEqual([
      { source: "empty", matches: [] },
      { source: "bare", matches: ["src/index.ts"] },
    ]);
  });
});

describe("gradeBands", () => {
  it("derives the score ranges from gradeFor", () => {
    expect(gradeBands()).toEqual([
      { grade: "A", min: 90, max: 100 },
      { grade: "B", min: 75, max: 89 },
      { grade: "C", min: 60, max: 74 },
      { grade: "D", min: 0, max: 59 },
    ]);
  });
});
