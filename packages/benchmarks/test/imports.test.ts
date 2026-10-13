import { describe, expect, it } from "vitest";
import {
  countTestCases,
  countTargetTestCases,
  localNames,
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

  it("finds aliases in named imports and destructured imports", () => {
    const source = `
      import { add as sum } from "../src/math.mjs";
      const { add: requiredSum } = require("../src/math.mjs");
      const { add: dynamicSum } = await import("../src/math.mjs");
      // import { add as commentAlias } from "../src/math.mjs";
      const note = "const { add: stringAlias } = require('../src/math.mjs')";
      export { add as reExport };
    `;
    expect(localNames(source, "add")).toEqual([
      "add",
      "sum",
      "requiredSum",
      "dynamicSum",
    ]);
    expect(
      localNames("import { type add as typed } from '../src/math.mjs';", "add"),
    ).toEqual(["add"]);
  });

  it("recognizes use of an imported alias but not its declaration alone", () => {
    const source = `
      import { add as sum } from "../src/math.mjs";
      test("sum", () => assert.equal(sum(1, 2), 3));
    `;
    expect(referencesIdentifier(source, "add")).toBe(true);
    expect(
      referencesIdentifier(
        'import { add as sum } from "../src/math.mjs"; test("x", () => {});',
        "add",
      ),
    ).toBe(false);
  });

  it("scopes aliases to imports that resolve to the target module", () => {
    const scope = { fromFile: "test/add.test.mjs", target: "src/math.mjs" };
    const source = `
      import { add } from "../src/math.mjs";
      import { add as sum } from "./other.mjs";
      test("x", () => sum(1, 2));
    `;
    expect(localNames(source, "add", scope)).toEqual(["add"]);
    expect(referencesIdentifier(source, "add", scope)).toBe(false);

    const targetAlias = `
      import { add as sum } from "../src/math.mjs";
      test("x", () => sum(1, 2));
    `;
    expect(referencesIdentifier(targetAlias, "add", scope)).toBe(true);

    const requireAlias = `
      const { add: sum } = require("./other.mjs");
      test("x", () => sum(1, 2));
    `;
    expect(localNames(requireAlias, "add", scope)).toEqual(["add"]);
    expect(referencesIdentifier(requireAlias, "add", scope)).toBe(false);
  });

  it.each([
    ['import { add } from "./other.mjs";', "named import"],
    ['import { x as add } from "./other.mjs";', "named import alias"],
    ['import add from "./other.mjs";', "default import"],
    ['import * as add from "./other.mjs";', "namespace import"],
    ['const { add } = require("./other.mjs");', "require shorthand"],
    ['const { x: add } = require("./other.mjs");', "require alias"],
    [
      'const { add } = await import("./other.mjs");',
      "dynamic import shorthand",
    ],
    ['const add = require("./other.mjs");', "assigned require"],
  ])("drops a bare name bound by an unrelated %s", (declaration) => {
    const scope = { fromFile: "test/add.test.mjs", target: "src/math.mjs" };
    const source = `
      import { add as sum } from "../src/math.mjs";
      ${declaration}
      test("x", () => add(1, 2));
    `;
    expect(localNames(source, "add", scope)).toEqual(["sum"]);
    expect(referencesIdentifier(source, "add", scope)).toBe(false);
  });

  it("keeps target aliases and namespace member access", () => {
    const scope = { fromFile: "test/add.test.mjs", target: "src/math.mjs" };
    const targetAlias = `
      import { add as sum } from "../src/math.mjs";
      import { add } from "./other.mjs";
      test("x", () => sum(1, 2));
    `;
    expect(referencesIdentifier(targetAlias, "add", scope)).toBe(true);

    const targetNamespace = `
      import * as math from "../src/math.mjs";
      import { add } from "./other.mjs";
      test("x", () => math.add(1, 2));
    `;
    expect(localNames(targetNamespace, "add", scope)).toEqual([]);
    expect(referencesIdentifier(targetNamespace, "add", scope)).toBe(true);
  });

  it.each(["other.add(1)", "other?.add(1)", "other . add(1)"])(
    "does not count unrelated member access %s",
    (call) => {
      const source = `import { add } from "../src/math.mjs";\n${call}\n`;
      expect(referencesIdentifier(source, "add")).toBe(false);
      expect(referencesIdentifier(source.replace(call, "add(1)"), "add")).toBe(
        true,
      );
    },
  );
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

  it("counts only cases with a target reference, excluding code before the first case", () => {
    const source = `
      const before = add(0, 1);
      test("unrelated", () => {});
      it("uses add", () => add(1, 2));
    `;
    expect(
      countTargetTestCases(source, "add", {
        fromFile: "test/math.test.mjs",
        target: "src/math.mjs",
      }),
    ).toBe(1);
  });
});
