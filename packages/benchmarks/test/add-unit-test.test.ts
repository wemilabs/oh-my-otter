import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createVerifyContext } from "../src/index";
import task from "../src/tasks/add-unit-test/verify";
import {
  failingTest,
  npmPackage,
  passingTest,
  startTask,
  verifyTask,
  writeFiles,
  type Files,
} from "./helpers";
import { withRestoreOnSignal } from "../src/tasks/add-unit-test/verify";

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
  it("restores mutant bytes when interrupted by a signal", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "omot-signal-"));
    const file = path.join(root, "source.js");
    const original = Buffer.from("const value = 1;\n");
    writeFileSync(file, "const value = 2;\n");
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    try {
      await withRestoreOnSignal(file, original, async () => {
        process.emit("SIGINT");
      });
      expect(readFileSync(file)).toEqual(original);
      expect(kill).toHaveBeenCalledWith(process.pid, "SIGINT");
    } finally {
      kill.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reclaims an old empty mutation lock", async () => {
    const started = await startTask(task, base, params);
    const lock = path.join(
      os.tmpdir(),
      `omot-mutation-${createHash("sha256").update(path.resolve(started.root)).digest("hex")}.lock`,
    );
    writeFileSync(lock, "");
    const stale = new Date(Date.now() - 11_000);
    utimesSync(lock, stale, stale);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": addTest,
    });
    expect(result.outcome).toBe("pass");
  });

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
        "Test cases that use add in changed test files: 0 → 1.",
        "test script passed.",
        "Mutation check: the tests caught 1 of 1 injected bugs in add (line 2: + → -).",
      ],
    });
  });

  it("is partial when the new test does not catch injected bugs", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": `import { test } from "node:test";
import { add } from "../src/math.mjs";
test("add", () => { add(2, 3); });
`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "Mutation check: the tests caught 0 of 1 injected bugs in add (line 2: + → -).",
    );
    expect(result.reasons).toContain(
      "The new tests pass but caught none of 1 injected bugs in add.",
    );
  });

  it("excludes mutants already caught by baseline tests and restores test files", async () => {
    const strongBase: Files = {
      ...base,
      "test/smoke.test.mjs": `import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "../src/math.mjs";
test("baseline add", () => assert.equal(add(2, 3), 5));
`,
    };
    const started = await startTask(task, strongBase, params);
    const originalTest = await readFile(
      path.join(started.root, "test/smoke.test.mjs"),
    );
    const weakTest = `import { test } from "node:test";
import { add } from "../src/math.mjs";
test("weak add", () => { add(2, 3); });
`;
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": weakTest,
    });
    expect(result.reasons).toContain(
      "Mutation check skipped: existing tests already catch every injected bug in add.",
    );
    expect(
      await readFile(path.join(started.root, "test/smoke.test.mjs")),
    ).toEqual(originalTest);
    expect(
      await readFile(path.join(started.root, "test/add.test.mjs"), "utf8"),
    ).toBe(weakTest);
  });

  it("skips the mutation check when the function has no supported operators", async () => {
    const files: Files = {
      ...base,
      "src/math.mjs": "export function add(value) { return value; }\n",
    };
    const started = await startTask(task, files, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": `import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "../src/math.mjs";
test("add", () => assert.equal(add(2), 2));
`,
    });
    expect(result.outcome).toBe("pass");
    expect(result.reasons).toContain(
      "Mutation check skipped: no operator in add that omot can flip.",
    );
  });

  it("restores CRLF source bytes after testing mutations", async () => {
    const source = Buffer.from(
      "export function add(a, b) {\r\n  return a + b;\r\n}\r\n",
    );
    const files: Files = {
      ...base,
      "src/math.mjs": source.toString("utf8"),
    };
    const started = await startTask(task, files, params);
    await verifyTask(task, started, params, { "test/add.test.mjs": addTest });
    expect(await readFile(path.join(started.root, "src/math.mjs"))).toEqual(
      source,
    );
  });

  it("restores source bytes when the test runner throws during a mutation", async () => {
    const source = Buffer.from(base["src/math.mjs"]!);
    const started = await startTask(task, base, params);
    await writeFiles(started.root, { "test/add.test.mjs": addTest });
    const ctx = createVerifyContext(
      started.root,
      {
        commit: started.commit,
        data: started.data,
        scripts: started.scripts,
      },
      { params },
    );
    let calls = 0;
    ctx.runScript = async () => {
      calls += 1;
      if (calls > 1) throw new Error("script runner failed");
      return {
        code: 0,
        stdout: "",
        stderr: "",
        output: "",
        timedOut: false,
      };
    };
    await expect(task.verify(ctx)).rejects.toThrow("script runner failed");
    expect(await readFile(path.join(started.root, "src/math.mjs"))).toEqual(
      source,
    );
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

  it("does not count an alias imported from an unrelated module", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/other.mjs": "export function add(a, b) { return a + b; }\n",
      "test/add.test.mjs": `import { test } from "node:test";
import { add } from "../src/math.mjs";
import { add as sum } from "./other.mjs";
test("x", () => sum(1, 2));
`,
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons.join("\n")).toContain(
      "import src/math.mjs but never use add",
    );
  });

  it("does not count a bare name imported from an unrelated module", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/other.mjs": "export function add(a, b) { return a + b; }\n",
      "test/add.test.mjs": `import { test } from "node:test";
import { add as sum } from "../src/math.mjs";
import { add } from "./other.mjs";
test("x", () => add(1, 2));
`,
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons.join("\n")).toContain(
      "import src/math.mjs but never use add",
    );
  });

  it("keeps a target alias when the bare name comes from another module", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/other.mjs": "export function add(a, b) { return a + b; }\n",
      "test/add.test.mjs": `import { test } from "node:test";
import assert from "node:assert/strict";
import { add as sum } from "../src/math.mjs";
import { add } from "./other.mjs";
test("x", () => assert.equal(sum(1, 2), 3));
`,
    });
    expect(result.outcome).toBe("pass");
  });

  it("keeps target namespace member access when the bare name comes from another module", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/other.mjs": "export function add(a, b) { return a + b; }\n",
      "test/add.test.mjs": `import { test } from "node:test";
import assert from "node:assert/strict";
import * as math from "../src/math.mjs";
import { add } from "./other.mjs";
test("x", () => assert.equal(math.add(1, 2), 3));
`,
    });
    expect(result.outcome).toBe("pass");
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
      "test/add.test.mjs": `${addTest}\ntest("unrelated", () => {});\n`,
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons).toContain(
      "No new test cases that use add: changed test files went 1 → 1.",
    );
  });

  it("does not credit a hook after a new placeholder test", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": `import { test, afterEach } from "node:test";
import { add } from "../src/math.mjs";
test("placeholder", () => {});
afterEach(() => add(1, 2));
`,
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons.join("\n")).toContain("No new test cases");
  });

  it("passes when a changed file adds another case that uses the target", async () => {
    const files: Files = {
      ...base,
      "test/add.test.mjs": addTest,
    };
    const started = await startTask(task, files, params);
    const result = await verifyTask(task, started, params, {
      "test/add.test.mjs": `${addTest}\ntest("also adds", () => assert.equal(add(3, 4), 7));\n`,
    });
    expect(result.outcome).toBe("pass");
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
