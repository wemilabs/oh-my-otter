import { describe, expect, it } from "vitest";
import { applyMutation, findMutations } from "../src/lib/mutations";
import task, { countSkips } from "../src/tasks/fix-failing-test/verify";
import { createPrepareContext } from "../src/index";
import {
  createRepo,
  git,
  npmPackage,
  startTask,
  verifyTask,
  writeFiles,
  type Files,
} from "./helpers";

const source =
  "// returns true for adults\nexport function isAdult(age) {\n  return age >= 18;\n}\n";
const spec = `import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdult } from "../src/age.mjs";
test("adult", () => {
  assert.equal(isAdult(18), true);
  assert.equal(isAdult(17), false);
});
`;
const base: Files = {
  "package.json": npmPackage({ test: "node --test" }),
  "package-lock.json": "{}\n",
  "src/age.mjs": source,
  "test/age.test.mjs": spec,
};
const params = { file: "src/age.mjs" };

describe("fix-failing-test", () => {
  it("introduces the failure on a throwaway branch and passes once fixed", async () => {
    const started = await startTask(task, base, params);
    const branch = (
      await git(started.root, ["rev-parse", "--abbrev-ref", "HEAD"])
    ).trim();
    expect(branch).toMatch(/^omot\/fix-failing-test-\d+$/);
    expect(started.data).toMatchObject({
      file: "src/age.mjs",
      original_branch: "main",
      mutation: "line 3: >= → >",
    });
    const log = await git(started.root, ["log", "--format=%s", "main..HEAD"]);
    expect(log.trim()).toBe(
      "omot bench: introduce a failing test (fix-failing-test)",
    );
    const result = await verifyTask(task, started, params, {
      "src/age.mjs": source,
    });
    expect(result.outcome).toBe("pass");
  });

  it("is partial when test files were modified", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "src/age.mjs": source,
      "test/age.test.mjs": `${spec}// touched\n`,
    });
    expect(result.outcome).toBe("partial");
  });

  it("fails when tests are skipped, deleted, or still failing", async () => {
    const started = await startTask(task, base, params);
    expect((await verifyTask(task, started, params, {})).outcome).toBe("fail");
    const skipped = await verifyTask(task, started, params, {
      "test/age.test.mjs": spec.replace('test("adult"', 'test.skip("adult"'),
    });
    expect(skipped.outcome).toBe("fail");
    expect(skipped.reasons).toContain(
      "1 test(s) skipped, focused, or marked todo.",
    );
    const deleted = await verifyTask(task, started, params, {
      "test/age.test.mjs": null,
    });
    expect(deleted.outcome).toBe("fail");
  });

  it("requires confirmation and changes nothing without it", async () => {
    await expect(startTask(task, base, params, { yes: false })).rejects.toThrow(
      /Re-run with --yes/,
    );
    await expect(
      startTask(task, base, params, {
        yes: false,
        isTTY: true,
        confirm: async () => false,
      }),
    ).rejects.toThrow(/Cancelled/);
  });

  it("refuses a dirty working tree", async () => {
    const root = await createRepo(base);
    await writeFiles(root, { "notes.txt": "wip\n" });
    const ctx = createPrepareContext(root, { params, yes: true });
    await expect(task.prepare?.(ctx)).rejects.toThrow(/uncommitted changes/);
    expect(
      (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim(),
    ).toBe("main");
  });

  it("finds operator mutations outside comments and strings", () => {
    const mutations = findMutations(
      "const a = b === 'x >= y' && c >= 1; // a || b\n",
    );
    expect(mutations.map((entry) => `${entry.from}${entry.to}`)).toEqual([
      "===!==",
      "&&||",
      ">=>",
    ]);
    expect(
      applyMutation("a >= b", { index: 2, line: 1, from: ">=", to: ">" }),
    ).toBe("a > b");
    expect(
      countSkips("it.skip('x'); xit('y'); test.todo('z'); describe('ok')"),
    ).toBe(3);
  });
});
