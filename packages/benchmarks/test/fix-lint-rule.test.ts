import { describe, expect, it } from "vitest";
import { countDisables } from "../src/lib/eslint";
import task from "../src/tasks/fix-lint-rule/verify";
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
  "eslint.config.mjs":
    'export default [{ files: ["**/*.mjs"], rules: { "prefer-const": "error" } }];\n',
  "src/a.mjs": "let a = 1;\nexport const first = a;\n",
  "src/b.mjs": "let b = 2;\nexport const second = b;\n",
  "test/ok.test.mjs": passingTest,
};
const params = { rule: "prefer-const" };
const fixedA = "const a = 1;\nexport const first = a;\n";
const fixedB = "const b = 2;\nexport const second = b;\n";

describe("fix-lint-rule", () => {
  it("passes when every violation is fixed and tests pass", async () => {
    const started = await startTask(task, base, params);
    expect(started.data).toEqual({ violations: 2 });
    const result = await verifyTask(task, started, params, {
      "src/a.mjs": fixedA,
      "src/b.mjs": fixedB,
    });
    expect(result).toEqual({
      outcome: "pass",
      reasons: ["prefer-const violations: 2 → 0.", "test script passed."],
    });
  });

  it("is partial when some violations remain", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "src/a.mjs": fixedA,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain("Remaining in: src/b.mjs.");
  });

  it("is partial when violations are silenced with disable comments", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "src/a.mjs": fixedA,
      "src/b.mjs": `// eslint-disable-next-line prefer-const\n${base["src/b.mjs"]}`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "1 new eslint-disable comment(s) cover prefer-const.",
    );
  });

  it("is partial when tests fail", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "src/a.mjs": fixedA,
      "src/b.mjs": fixedB,
      "test/ok.test.mjs": failingTest,
    });
    expect(result.outcome).toBe("partial");
  });

  it("fails when nothing was fixed", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {});
    expect(result.outcome).toBe("fail");
  });

  it("rejects a rule without violations", async () => {
    await expect(startTask(task, base, { rule: "no-var" })).rejects.toThrow(
      /no violations of no-var/,
    );
  });

  it("counts disable directives for a rule", () => {
    expect(
      countDisables(
        "// eslint-disable-line prefer-const -- why",
        "prefer-const",
      ),
    ).toBe(1);
    expect(countDisables("/* eslint-disable */", "prefer-const")).toBe(1);
    expect(
      countDisables("// eslint-disable-next-line no-var", "prefer-const"),
    ).toBe(0);
    expect(
      countDisables(
        "/* eslint-disable no-var, prefer-const */",
        "prefer-const",
      ),
    ).toBe(1);
  });
});
