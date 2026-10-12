import { describe, expect, it } from "vitest";
import task from "../src/tasks/add-unit-test/verify";
import {
  failingTest,
  npmPackage,
  passingTest,
  startTask,
  verifyTask,
  type Files,
} from "./helpers";

const base: Files = {
  "package.json": npmPackage({ test: "node --test" }),
  "package-lock.json": "{}\n",
  "src/math.mjs": "export function add(a, b) {\n  return a + b;\n}\n",
  "test/smoke.test.mjs": passingTest,
};
const params = { file: "src/math.mjs", function: "add" };

const addTest = `import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "../src/math.mjs";
test("add", () => assert.equal(add(2, 3), 5));
`;
const importedButUnused = `import { test } from "node:test";
import { add } from "../src/math.mjs";
test("placeholder", () => {});
`;

describe("add-unit-test", () => {
  it("passes when a passing test for the function is added", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": addTest,
    });
    expect(result).toEqual({
      outcome: "pass",
      reasons: [
        "Test files added or changed: test/add.test.mjs.",
        "add is used in test/add.test.mjs, which imports src/math.mjs.",
        "Test cases in changed test files: 0 → 1.",
        "test script passed.",
      ],
    });
  });

  it("passes when the function is imported under an alias", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": `import { test } from "node:test";
import assert from "node:assert/strict";
import { add as sum } from "../src/math.mjs";
test("add", () => assert.equal(sum(2, 3), 5));
`,
    });
    expect(result.outcome).toBe("pass");
  });

  it("passes when a require destructuring alias is used", async () => {
    const files: Files = {
      ...base,
      "package.json": npmPackage({ test: "node --test" }, { type: "commonjs" }),
      "src/math.js": "exports.add = (a, b) => a + b;\n",
    };
    const file = "src/math.js";
    const started = await startTask(task, files, { file, function: "add" });
    const result = await verifyTask(
      task,
      started,
      { file, function: "add" },
      {
        "test/add.test.js": `const { test } = require("node:test");
const assert = require("node:assert/strict");
const { add: sum } = require("../src/math.js");
test("add", () => assert.equal(sum(2, 3), 5));
`,
      },
    );
    expect(result.outcome).toBe("pass");
  });

  it("fails when an imported alias is never called", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": `import { test } from "node:test";
import { add as sum } from "../src/math.mjs";
test("placeholder", () => {});
`,
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons.join("\n")).toContain("but never use add");
  });

  it("is partial when source files change too", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": addTest,
      "src/math.mjs": "export function add(a, b) {\n  return b + a;\n}\n",
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain("Non-test files changed: src/math.mjs.");
  });

  it("fails when the new test fails", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": failingTest,
    });
    expect(result.outcome).toBe("fail");
  });

  it("fails when a changed test imports but never uses the target function", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": importedButUnused,
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons.join("\n")).toContain(
      "import src/math.mjs but never use add",
    );
  });

  it("fails when the only test-file mention of the target is in a comment or string", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": `import { test } from "node:test";
// import { add } from "../src/math.mjs";
const note = 'import { add } from "../src/math.mjs"';
test("placeholder", () => {});
`,
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons.join("\n")).toContain("No changed test file imports");
  });

  it("fails when a test file only has a comment mentioning the target", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": `import { test } from "node:test"; // add
test("placeholder", () => {});
`,
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons.join("\n")).toContain("No changed test file imports");
  });

  it.each([
    [
      "an extensionless import",
      "src/math.mjs",
      `import { expect, test } from "vitest";
import { add } from "../src/math";
test("add", () => expect(add(2, 3)).toBe(5));
`,
    ],
    [
      "an index import",
      "src/lib/index.mjs",
      `import { expect, test } from "vitest";
import { add } from "../src/lib";
test("add", () => expect(add(2, 3)).toBe(5));
`,
    ],
  ])("passes with %s", async (_, file, source) => {
    const files: Files = {
      ...base,
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage({ test: "vitest run" }),
      "test/smoke.test.mjs": `import { expect, test } from "vitest";
test("ok", () => expect(1).toBe(1));
`,
      ...(file === "src/lib/index.mjs"
        ? {
            "src/lib/index.mjs":
              "export function add(a, b) { return a + b; }\n",
          }
        : {}),
    };
    const started = await startTask(task, files, { file, function: "add" });
    const result = await verifyTask(
      task,
      started,
      { file, function: "add" },
      {
        "test/add.test.mjs": source,
      },
    );
    expect(result.outcome).toBe("pass");
  });

  it("passes with require()", async () => {
    const files: Files = {
      ...base,
      "package.json": npmPackage({ test: "node --test" }, { type: "commonjs" }),
      "src/math.js": "exports.add = (a, b) => a + b;\n",
    };
    const file = "src/math.js";
    const started = await startTask(task, files, { file, function: "add" });
    const result = await verifyTask(
      task,
      started,
      { file, function: "add" },
      {
        "test/add.test.js": `const { test } = require("node:test");
const assert = require("node:assert/strict");
const { add } = require("../src/math.js");
test("add", () => assert.equal(add(2, 3), 5));
`,
      },
    );
    expect(result.outcome).toBe("pass");
  });

  it("fails when no tests were added", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {});
    expect(result).toEqual({
      outcome: "fail",
      reasons: ["No test files were added or changed."],
    });
  });

  it("fails when an existing test is edited without adding a case", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/smoke.test.mjs": `${passingTest}// edited without another test\n`,
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons.join("\n")).toContain("No new test cases");
  });

  it("ignores unrelated test cases when checking exercising test files", async () => {
    const files: Files = {
      ...base,
      "test/add.test.mjs": addTest,
    };
    const started = await startTask(task, files, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": `${addTest}// edited without another case\n`,
      "test/unrelated.test.mjs": passingTest,
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons).toContain(
      "No new test cases: it()/test() calls in test files that use add went 1 → 1.",
    );
  });

  it("requires scripts.test and explains how to generate the missing script", async () => {
    await expect(
      startTask(
        task,
        {
          ...base,
          "package.json": npmPackage({}),
        },
        params,
      ),
    ).rejects.toThrow(/scripts\.test.*omot scan --fix/);
  });

  it("rejects a function that is not in the file", async () => {
    await expect(
      startTask(task, base, { file: "src/math.mjs", function: "subtract" }),
    ).rejects.toThrow(/does not contain subtract/);
  });
});
