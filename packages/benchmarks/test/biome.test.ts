import { describe, expect, it } from "vitest";
import {
  biomeRule,
  countBiomeSuppressions,
  isBiomeConfig,
  parseBiomeGithub,
  runBiome,
} from "../src/lib/biome";
import type { CommandResult, RepoContext } from "../src/types";

function result(output: string, code = 0, stderr = ""): CommandResult {
  return {
    code,
    stdout: output,
    stderr,
    output,
    timedOut: false,
  };
}

describe("Biome rule normalization", () => {
  it.each([
    ["style/useConst", "lint/style/useConst"],
    ["lint/style/useConst", "lint/style/useConst"],
    ["suspicious/noDoubleEquals", "lint/suspicious/noDoubleEquals"],
    ["import/order", null],
    ["prefer-const", null],
    ["@typescript-eslint/no-explicit-any", null],
  ])("normalizes %s", (rule, expected) => {
    expect(biomeRule(rule)).toBe(expected);
  });
});

describe("Biome GitHub output", () => {
  it("counts matching diagnostics and relativizes escaped Windows paths", () => {
    const output = [
      "::warning title=lint/style/useConst,file=C:\\repo\\src\\x%2Cy%3Az.js,line=1::first",
      "::error title=lint/style/useConst,file=C:\\repo\\src\\x%2Cy%3Az.js,line=2::second",
      "::warning title=lint/suspicious/noDoubleEquals,file=C:\\repo\\src\\other.js,line=1::other",
      "",
    ].join("\n");
    expect(
      parseBiomeGithub(result(output, 1), "lint/style/useConst", "C:\\repo"),
    ).toEqual({
      count: 2,
      files: ["src/x,y:z.js"],
      fatal: 0,
      fatalFiles: [],
    });
  });

  it("decodes workflow escapes in order and ignores other rule titles", () => {
    const output =
      "::notice title=lint/style/useConst,file=/work/repo/src/a%252Cb.js::match\n" +
      "::warning title=lint/style/useConstExtra,file=/work/repo/src/no.js::other\n";
    expect(
      parseBiomeGithub(result(output), "lint/style/useConst", "/work/repo"),
    ).toEqual({
      count: 1,
      files: ["src/a%2Cb.js"],
      fatal: 0,
      fatalFiles: [],
    });
  });

  it("counts non-lint error annotations as fatal but not other lint rules", () => {
    const output = [
      "::error title=parse,file=/work/repo/src/a.js::parse error",
      "::error title=parse,file=/work/repo/src/a.js::another parse error",
      "::error title=lint/style/noVar,file=/work/repo/src/b.js::other lint rule",
      "::error title=internal,file=/work/repo/src/b.js::internal error",
    ].join("\n");
    expect(
      parseBiomeGithub(result(output, 1), "lint/style/useConst", "/work/repo"),
    ).toMatchObject({
      count: 0,
      fatal: 3,
      fatalFiles: ["src/a.js", "src/b.js"],
    });
  });

  it("tracks fileless fatal errors by title and trimmed, capped message", () => {
    const message = "m".repeat(121);
    const output = `::error title=internalError/io::  ${message}  `;
    expect(
      parseBiomeGithub(result(output, 1), "lint/style/useConst", "/work/repo"),
    ).toMatchObject({
      fatal: 1,
      fatalFiles: [`(no file) internalError/io: ${"m".repeat(120)}`],
    });
  });

  it("reports the first CLI error when Biome exits without workflow lines", () => {
    expect(() =>
      parseBiomeGithub(
        result("", 1, "Configuration is invalid.\nMore detail."),
        "lint/style/useConst",
        "/work/repo",
      ),
    ).toThrow("Biome could not run: Configuration is invalid.");
  });

  it("does not parse partial output after Biome times out", async () => {
    const ctx = {
      root: "/repo",
      runPackageBin: async () => ({
        ...result(
          "::warning title=lint/style/useConst,file=/repo/a.js::partial",
        ),
        timedOut: true,
      }),
    } as unknown as RepoContext;
    await expect(runBiome(ctx, "lint/style/useConst")).rejects.toThrow(
      "Biome timed out.",
    );
  });
});

describe("Biome suppressions and config files", () => {
  const rule = "lint/style/useConst";

  it("counts exact, group, global, multi-category, all, and start suppressions", () => {
    const source = [
      "// biome-ignore lint/style/useConst: reason",
      "// biome-ignore lint/style: reason",
      "// biome-ignore lint: reason",
      "// biome-ignore lint/suspicious/noDoubleEquals lint/style/useConst: reason",
      "// biome-ignore-all lint/style/useConst: reason",
      "// biome-ignore-start lint/style/useConst: reason",
    ].join("\n");
    expect(countBiomeSuppressions(source, rule)).toBe(6);
  });

  it("does not count end markers or other rules and strips category specifiers", () => {
    const source = [
      "// biome-ignore-end lint/style/useConst: reason",
      "// biome-ignore lint/suspicious/noDoubleEquals: reason",
      "// biome-ignore lint/style/useConst(legacy): reason",
    ].join("\n");
    expect(countBiomeSuppressions(source, rule)).toBe(1);
  });

  it.each([
    [".biome.json", true],
    ["packages/a/biome.jsonc", true],
    ["packages/a/.biome.json", true],
    ["biome.json5", false],
    ["eslint.config.js", false],
  ])("recognizes Biome config %s", (file, expected) => {
    expect(isBiomeConfig(file)).toBe(expected);
  });
});
