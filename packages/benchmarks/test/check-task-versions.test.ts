import { describe, expect, it } from "vitest";
import { checkTaskVersions } from "../scripts/check-task-versions.mjs";
import { createRepo, git, writeFiles } from "./helpers";

const dir = "packages/benchmarks/src/tasks/demo";
const manifest = (version: number) =>
  `${JSON.stringify({ id: "demo", version })}\n`;

async function repo() {
  const root = await createRepo({
    [`${dir}/task.json`]: manifest(1),
    [`${dir}/prompt.md`]: "Do the thing.\n",
    [`${dir}/verify.ts`]: "export default {};\n",
    "docs/benchmarks/demo.md": "# demo\n",
  });
  await git(root, ["branch", "base"]);
  return root;
}

describe("check-task-versions", () => {
  it("passes when nothing changed", async () => {
    const root = await repo();
    expect(checkTaskVersions({ root, base: "base" })).toEqual([]);
  });

  it("fails when the prompt changes without a version bump", async () => {
    const root = await repo();
    await writeFiles(root, { [`${dir}/prompt.md`]: "Do another thing.\n" });
    expect(checkTaskVersions({ root, base: "base" })).toEqual([
      expect.stringMatching(
        /^demo: prompt\.md changed since base but version is still 1/,
      ),
    ]);
  });

  it("fails when the verifier changes in a commit without a bump", async () => {
    const root = await repo();
    await writeFiles(root, {
      [`${dir}/verify.ts`]: "export default { v: 2 };\n",
    });
    await git(root, ["commit", "-qam", "change verifier"]);
    expect(checkTaskVersions({ root, base: "base" })[0]).toMatch(
      /verify\.ts changed/,
    );
  });

  it("passes when the version is bumped, and ignores CRLF-only changes", async () => {
    const root = await repo();
    await writeFiles(root, {
      [`${dir}/prompt.md`]: "Do another thing.\n",
      [`${dir}/task.json`]: manifest(2),
    });
    expect(checkTaskVersions({ root, base: "base" })).toEqual([]);
    const other = await repo();
    await writeFiles(other, { [`${dir}/prompt.md`]: "Do the thing.\r\n" });
    expect(checkTaskVersions({ root: other, base: "base" })).toEqual([]);
  });

  it("accepts new tasks, requires their docs, and rejects downgrades", async () => {
    const root = await repo();
    await writeFiles(root, {
      "packages/benchmarks/src/tasks/fresh/task.json": `${JSON.stringify({ id: "fresh", version: 1 })}\n`,
      [`${dir}/task.json`]: manifest(0),
    });
    expect(checkTaskVersions({ root, base: "base" })).toEqual([
      "demo: version went down (1 → 0).",
      "fresh: missing docs file docs/benchmarks/fresh.md.",
    ]);
  });
});
