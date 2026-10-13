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
const biomeBase: Files = {
  "package.json": npmPackage({ test: "node --test" }),
  "package-lock.json": "{}\n",
  "biome.json": "{}\n",
  "src/a.js": "let a = 1;\nexport { a };\n",
  "test/ok.test.mjs": passingTest,
  "node_modules/@biomejs/biome/package.json": JSON.stringify({
    bin: { biome: "biome.cjs" },
  }),
  "node_modules/@biomejs/biome/biome.cjs": `const fs = require("node:fs");
const source = fs.readFileSync("src/a.js", "utf8");
if (source.includes("parse-error")) {
  process.stdout.write("::error title=parse,file=" + process.cwd() + "/src/a.js::Parse error.\\n");
}
if (source.includes("let a")) {
  process.stdout.write("::warning title=lint/style/useConst,file=" + process.cwd() + "/src/a.js,line=1::Use const.\\n");
}
`,
};
const eslintBase: Files = {
  ...base,
  "node_modules/eslint/package.json": JSON.stringify({
    bin: { eslint: "eslint.cjs" },
  }),
  "node_modules/eslint/eslint.cjs": `const fs = require("node:fs");
const source = fs.readFileSync("src/a.mjs", "utf8");
const messages = [];
if (source.includes("let a")) messages.push({ ruleId: "prefer-const" });
if (source.includes("parse-error")) messages.push({ fatal: true });
process.stdout.write(JSON.stringify([{ filePath: process.cwd() + "/src/a.mjs", messages }]));
`,
};

describe("fix-lint-rule", () => {
  it("passes when every violation is fixed and tests pass", async () => {
    const started = await startTask(task, base, params);
    expect(started.data).toEqual({ violations: 2, fatal: 0 });
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

  it("is partial when ESLint reports a new parse error", async () => {
    const started = await startTask(task, eslintBase, params);
    const result = await verifyTask(task, started, params, {
      "src/a.mjs": "const a = 1; /* parse-error */\nexport const first = a;\n",
      "src/b.mjs": fixedB,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "ESLint reported 1 new parse or internal error(s); violations of prefer-const in those files are not counted.",
    );
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

  it("uses Biome, normalizes the rule, and reports config changes as partial", async () => {
    const started = await startTask(task, biomeBase, {
      rule: "style/useConst",
    });
    expect(started.data).toEqual({ violations: 1, fatal: 0 });
    const result = await verifyTask(
      task,
      started,
      { rule: "style/useConst" },
      {
        "biome.json": '{"linter":{"rules":{"style":{"useConst":"off"}}}}\n',
        "src/a.js": "const a = 1;\nexport { a };\n",
      },
    );
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain("lint/style/useConst violations: 1 → 0.");
    expect(result.reasons).toContain(
      "Biome configuration changed: biome.json.",
    );
  });

  it("reports new Biome ignore directives as partial", async () => {
    const started = await startTask(task, biomeBase, {
      rule: "lint/style/useConst",
    });
    const result = await verifyTask(
      task,
      started,
      { rule: "lint/style/useConst" },
      {
        "src/a.js":
          "// biome-ignore lint/style/useConst: reason\nconst a = 1;\nexport { a };\n",
      },
    );
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "1 new biome-ignore comment(s) cover lint/style/useConst.",
    );
  });

  it("is partial when Biome reports a new parse error", async () => {
    const started = await startTask(task, biomeBase, {
      rule: "style/useConst",
    });
    const result = await verifyTask(
      task,
      started,
      { rule: "style/useConst" },
      {
        "src/a.js": "const a = 1; /* parse-error */\nexport { a };\n",
      },
    );
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "Biome reported 1 new parse or internal error(s); violations of lint/style/useConst in those files are not counted.",
    );
  });
});
