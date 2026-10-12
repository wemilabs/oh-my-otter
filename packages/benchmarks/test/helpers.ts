import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { afterEach } from "vitest";
import {
  createPrepareContext,
  createVerifyContext,
  headCommit,
  resolveRepoRoot,
} from "../src/index";
import type { Task, VerifyResult } from "../src/index";

export type Files = Record<string, string | null>;

const tmpRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.tmp",
);
const repos: string[] = [];

afterEach(async () => {
  await Promise.all(
    repos.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

export async function git(root: string, args: string[]): Promise<string> {
  const result = await execa("git", args, { cwd: root, stdin: "ignore" });
  return String(result.stdout);
}

export async function writeFiles(root: string, files: Files): Promise<void> {
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(root, file);
    if (contents === null) {
      await rm(target, { force: true });
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}

/** Creates a committed git repository (inside the package so local node_modules resolve). */
export async function createRepo(files: Files): Promise<string> {
  await mkdir(tmpRoot, { recursive: true });
  const root = await mkdtemp(path.join(tmpRoot, "repo-"));
  repos.push(root);
  await git(root, ["init", "--quiet", "--initial-branch=main"]);
  await git(root, ["config", "core.autocrlf", "false"]);
  await git(root, ["config", "user.name", "Test"]);
  await git(root, ["config", "user.email", "test@example.invalid"]);
  await git(root, ["config", "commit.gpgsign", "false"]);
  await writeFiles(root, files);
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "--quiet", "-m", "baseline"]);
  return resolveRepoRoot(root);
}

export interface Started {
  root: string;
  commit: string;
  data: unknown;
  scripts?: Record<string, number>;
}

export async function startTask(
  task: Task,
  files: Files,
  params: Record<string, string>,
  options: {
    yes?: boolean;
    isTTY?: boolean;
    skipBaselineScripts?: boolean;
    confirm?: () => Promise<boolean>;
  } = {},
): Promise<Started> {
  const root = await createRepo(files);
  const ctx = createPrepareContext(root, {
    params,
    scripts: task.scripts,
    skipBaselineScripts: options.skipBaselineScripts,
    yes: options.yes ?? true,
    isTTY: options.isTTY ?? false,
    ...(options.confirm ? { confirm: options.confirm } : {}),
  });
  const data = task.prepare ? await task.prepare(ctx) : undefined;
  const baseline = await ctx.recordBaseline();
  return {
    root,
    commit: await headCommit(root),
    data,
    ...(baseline === null
      ? {}
      : {
          scripts: Object.fromEntries(
            Object.entries(baseline).map(([name, result]) => [
              name,
              result.code,
            ]),
          ),
        }),
  };
}

export async function verifyTask(
  task: Task,
  started: Started,
  params: Record<string, string>,
  changes: Files,
): Promise<VerifyResult> {
  await writeFiles(started.root, changes);
  const ctx = createVerifyContext(
    started.root,
    {
      commit: started.commit,
      data: started.data,
      ...(started.scripts === undefined ? {} : { scripts: started.scripts }),
    },
    { params },
  );
  return task.verify(ctx);
}

export const passingTest = `import { test } from "node:test";
import assert from "node:assert/strict";
test("ok", () => assert.equal(1, 1));
`;

export const failingTest = `import { test } from "node:test";
import assert from "node:assert/strict";
test("broken", () => assert.equal(1, 2));
`;

export function npmPackage(
  scripts: Record<string, string>,
  extra: Record<string, unknown> = {},
): string {
  return `${JSON.stringify({ name: "fixture", version: "1.0.0", private: true, type: "module", scripts, ...extra }, null, 2)}\n`;
}
