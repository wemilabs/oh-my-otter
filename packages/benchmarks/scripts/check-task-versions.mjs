#!/usr/bin/env node
// Fails when a benchmark task's prompt.md or verify.ts changed relative to the
// base branch without a version bump in its task.json.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TASKS_DIR = "packages/benchmarks/src/tasks";
export const DOCS_DIR = "docs/benchmarks";
const TRACKED = ["prompt.md", "verify.ts"];

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function show(root, ref, file) {
  try {
    return git(root, ["show", `${ref}:${file}`]);
  } catch {
    return null;
  }
}

function normalize(text) {
  return text === null ? null : text.replace(/\r\n/g, "\n");
}

function version(text) {
  if (text === null) return null;
  try {
    const value = JSON.parse(text).version;
    return Number.isInteger(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Compares the working tree's tasks with `base` (a git ref).
 * @param {{ root: string, base: string }} options
 * @returns {string[]} problems; empty when everything is fine
 */
export function checkTaskVersions({ root, base }) {
  const mergeBase = git(root, ["merge-base", base, "HEAD"]).trim();
  const tasksDir = path.join(root, TASKS_DIR);
  const problems = [];
  const ids = readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const id of ids) {
    const dir = `${TASKS_DIR}/${id}`;
    const manifestPath = path.join(root, dir, "task.json");
    if (!existsSync(manifestPath)) {
      problems.push(`${id}: missing ${dir}/task.json.`);
      continue;
    }
    const headVersion = version(readFileSync(manifestPath, "utf8"));
    if (headVersion === null) {
      problems.push(`${id}: task.json has no integer version.`);
      continue;
    }
    if (!existsSync(path.join(root, DOCS_DIR, `${id}.md`))) {
      problems.push(`${id}: missing docs file ${DOCS_DIR}/${id}.md.`);
    }
    const baseVersion = version(show(root, mergeBase, `${dir}/task.json`));
    if (baseVersion === null) continue;
    if (headVersion < baseVersion) {
      problems.push(
        `${id}: version went down (${baseVersion} → ${headVersion}).`,
      );
      continue;
    }
    const changed = TRACKED.filter((file) => {
      const current = path.join(root, dir, file);
      const head = existsSync(current) ? readFileSync(current, "utf8") : null;
      return (
        normalize(head) !== normalize(show(root, mergeBase, `${dir}/${file}`))
      );
    });
    if (changed.length > 0 && headVersion === baseVersion) {
      problems.push(
        `${id}: ${changed.join(" and ")} changed since ${base} but version is still ${headVersion}; bump "version" in ${dir}/task.json.`,
      );
    }
  }
  return problems;
}

function main() {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
  const flag = process.argv.indexOf("--base");
  const base =
    flag >= 0 && process.argv[flag + 1]
      ? process.argv[flag + 1]
      : `origin/${process.env.BASE_REF || "main"}`;
  const problems = checkTaskVersions({ root, base });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`✗ ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `✓ Benchmark task versions and docs are up to date with ${base}.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
