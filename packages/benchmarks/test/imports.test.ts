import { describe, expect, it } from "vitest";
import {
  countTestCases,
  moduleSpecifiers,
  referencesIdentifier,
  resolvesTo,
} from "../src/lib/imports";

describe("module imports", () => {
  it("extracts import, export, dynamic import, and require specifiers", () => {
    expect(
      moduleSpecifiers(`
        import { add } from "../src/math.mjs";
        export { subtract } from "./subtract.js";
        const lazy = import("../src/lazy.ts");
        const required = require("../src/required.cjs");
        // import "../src/comment.mjs"
        const text = 'require("../src/string.mjs")';
      `),
    ).toEqual([
      "../src/math.mjs",
      "./subtract.js",
      "../src/lazy.ts",
      "../src/required.cjs",
    ]);
  });

  it("resolves extension aliases and index imports", () => {
    expect(
      resolvesTo("../src/math.js", "test/math.test.ts", "src/math.ts"),
    ).toBe(true);
    expect(
      resolvesTo("@/lib/math", "test/math.test.ts", "src/lib/math.ts"),
    ).toBe(true);
    expect(
      resolvesTo("../src/lib", "test/math.test.mjs", "src/lib/index.mjs"),
    ).toBe(true);
    expect(
      resolvesTo("../src/other", "test/math.test.mjs", "src/lib/index.mjs"),
    ).toBe(false);
  });

  it("recognizes an executable identifier use, not imports, comments, or strings", () => {
    const source = `
      import { add } from "../src/math.mjs";
      // add(1, 2)
      const note = "add(1, 2)";
      test("add", () => {});
    `;
    expect(referencesIdentifier(source, "add")).toBe(false);
    expect(
      referencesIdentifier(`${source}\nconst total = add(1, 2);`, "add"),
    ).toBe(true);
  });
});

describe("test case counting", () => {
  it("ignores comments and strings, and counts parameterized/focused tests", () => {
    expect(
      countTestCases(`
        // test("comment", () => {});
        const example = "it('string', () => {})";
        test.each([1, 2])("number %s", () => {});
        it.only("focused", () => {});
        describe("suite", () => {});
      `),
    ).toBe(2);
  });
});
