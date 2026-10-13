import { describe, expect, it } from "vitest";
import { countDisables, parseEslintJson } from "../src/lib/eslint";
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
for (const file of ["src/a.js", "src/b.js"]) {
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  const absolute = process.cwd() + "/" + file;
  if (source.includes("fileless-error-a")) {
    process.stdout.write("::error title=internalError/io::  Error A  \\n");
  }
  if (source.includes("fileless-error-b")) {
    process.stdout.write("::error title=internalError/io::  Error B  \\n");
  }
  if (source.includes("fileless-long-error-a")) {
    process.stdout.write("::error title=internalError/io::  " + "x".repeat(125) + " A  \\n");
  }
  if (source.includes("fileless-long-error-b")) {
    process.stdout.write("::error title=internalError/io::  " + "x".repeat(125) + " B  \\n");
  }
  if (source.includes("parse-error")) {
    process.stdout.write("::error title=parse,file=" + absolute + "::Parse error.\\n");
  } else if (source.includes("let ")) {
    process.stdout.write("::warning title=lint/style/useConst,file=" + absolute + ",line=1::Use const.\\n");
  }
}
`,
};
const filelessBiomeBase: Files = {
  ...biomeBase,
  "src/a.js": "let a = 1; /* fileless-error-a */\nexport { a };\n",
};
const longFilelessBiomeBase: Files = {
  ...biomeBase,
  "src/a.js": "let a = 1; /* fileless-long-error-a */\nexport { a };\n",
};
const eslintBase: Files = {
  ...base,
  "node_modules/eslint/package.json": JSON.stringify({
    bin: { eslint: "eslint.cjs" },
  }),
  "node_modules/eslint/eslint.cjs": `const fs = require("node:fs");
const results = ["src/a.mjs", "src/b.mjs"].map((file) => {
  const source = fs.readFileSync(file, "utf8");
  const messages = [];
  if (source.includes("parse-error")) messages.push({ fatal: true });
  else if (source.includes("let ")) messages.push({ ruleId: "prefer-const" });
  return { filePath: process.cwd() + "/" + file, messages };
});
process.stdout.write(JSON.stringify(results));
`,
};

describe("fix-lint-rule", () => {
  it("returns sorted unique relative files for ESLint fatal messages", () => {
    const result = parseEslintJson(
      {
        code: 1,
        stdout: JSON.stringify([
          {
            filePath: "/repo/src/z.mjs",
            messages: [{ fatal: true }, { fatal: true }],
          },
          { filePath: "/repo/src/a.mjs", messages: [{ fatal: true }] },
        ]),
        stderr: "",
        output: "",
        timedOut: false,
      },
      "prefer-const",
      "/repo",
    );
    expect(result).toMatchObject({
      fatal: 3,
      fatalFiles: ["src/a.mjs", "src/z.mjs"],
    });
  });

  it("passes when every violation is fixed and tests pass", async () => {
    const started = await startTask(task, base, params);
    expect(started.data).toEqual({
      violations: 2,
      fatal: 0,
      fatalFiles: [],
    });
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
      "ESLint reported new parse or internal errors in src/a.mjs; violations of prefer-const there are not counted.",
    );
  });

  it("detects an ESLint parse failure moving to another file", async () => {
    const started = await startTask(
      task,
      {
        ...eslintBase,
        "src/a.mjs":
          "const a = 1; /* parse-error */\nexport const first = a;\n",
      },
      params,
    );
    expect(started.data).toEqual({
      violations: 1,
      fatal: 1,
      fatalFiles: ["src/a.mjs"],
    });
    const result = await verifyTask(task, started, params, {
      "src/a.mjs": fixedA,
      "src/b.mjs": "const b = 2; /* parse-error */\nexport const second = b;\n",
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "ESLint reported new parse or internal errors in src/b.mjs; violations of prefer-const there are not counted.",
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
    expect(started.data).toEqual({
      violations: 1,
      fatal: 0,
      fatalFiles: [],
    });
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
      "Biome reported new parse or internal errors in src/a.js; violations of lint/style/useConst there are not counted.",
    );
  });

  it("detects a Biome parse failure moving to another file", async () => {
    const started = await startTask(
      task,
      {
        ...biomeBase,
        "src/a.js": "const a = 1; /* parse-error */\nexport { a };\n",
        "src/b.js": "let b = 2;\nexport { b };\n",
      },
      { rule: "style/useConst" },
    );
    expect(started.data).toEqual({
      violations: 1,
      fatal: 1,
      fatalFiles: ["src/a.js"],
    });
    const result = await verifyTask(
      task,
      started,
      { rule: "style/useConst" },
      {
        "src/a.js": "const a = 1;\nexport { a };\n",
        "src/b.js": "const b = 2; /* parse-error */\nexport { b };\n",
      },
    );
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "Biome reported new parse or internal errors in src/b.js; violations of lint/style/useConst there are not counted.",
    );
  });

  it("detects a fileless Biome fatal error being replaced by another", async () => {
    const started = await startTask(task, filelessBiomeBase, {
      rule: "style/useConst",
    });
    expect(started.data).toEqual({
      violations: 1,
      fatal: 1,
      fatalFiles: ["(no file) internalError/io: Error A"],
    });
    const result = await verifyTask(
      task,
      started,
      { rule: "style/useConst" },
      {
        "src/a.js": "const a = 1; /* fileless-error-b */\nexport { a };\n",
      },
    );
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "Biome reported new parse or internal errors in (no file) internalError/io: Error B; violations of lint/style/useConst there are not counted.",
    );
  });

  it("distinguishes fileless fatal errors beyond their shared 120-character prefix", async () => {
    const started = await startTask(task, longFilelessBiomeBase, {
      rule: "style/useConst",
    });
    const messagePrefix = "x".repeat(125);
    expect(started.data).toMatchObject({
      fatalFiles: [`(no file) internalError/io: ${messagePrefix} A`],
    });
    const result = await verifyTask(
      task,
      started,
      { rule: "style/useConst" },
      {
        "src/a.js": "const a = 1; /* fileless-long-error-b */\nexport { a };\n",
      },
    );
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      `Biome reported new parse or internal errors in (no file) internalError/io: ${messagePrefix} B; violations of lint/style/useConst there are not counted.`,
    );
  });
});
