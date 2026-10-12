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
        "test script passed.",
      ],
    });
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

  it("fails when no tests were added", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {});
    expect(result).toEqual({
      outcome: "fail",
      reasons: ["No test files were added or changed."],
    });
  });

  it("rejects a function that is not in the file", async () => {
    await expect(
      startTask(task, base, { file: "src/math.mjs", function: "subtract" }),
    ).rejects.toThrow(/does not contain subtract/);
  });
});
