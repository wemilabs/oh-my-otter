import path from "node:path";
import picomatch from "picomatch";
import { gradeFor, type Check, type Grade } from "@oh-my-otter/core";
import { builtinChecks } from "@oh-my-otter/checks";

export interface CheckEntry {
  id: string;
  title: string;
  category: Check["category"];
  weight: number;
  why: string;
  howToPass: string | null;
  fixCreates: string[];
}

const EMPTY_FILES = new Map<string, string>();
const BARE_FILES = new Map([
  ["package.json", '{"name":"probe","scripts":{"test":"vitest"}}'],
  ["tsconfig.json", "{}"],
  ["src/index.ts", "export const url = process.env.API_URL;"],
]);
const PROBE_IGNORES = ["**/node_modules/**", "**/.git/**"].map((pattern) =>
  picomatch(pattern, { dot: true }),
);

function makeProbe(files: Map<string, string>): Parameters<Check["run"]>[0] {
  const packageJson = files.get("package.json");
  return {
    root: "/probe",
    exists: async (path) => files.has(path),
    read: async (path) => files.get(path) ?? null,
    glob: async (pattern) => {
      if (
        path.isAbsolute(pattern) ||
        /^[A-Za-z]:[\\/]/.test(pattern) ||
        pattern.startsWith("\\\\") ||
        pattern.replace(/\\/g, "/").split("/").includes("..")
      ) {
        throw new Error(`Path escapes repository root: ${pattern}`);
      }
      const matches = picomatch(pattern, { dot: true });
      return [...files.keys()]
        .map((file) => file.split(path.sep).join("/"))
        .filter((file) => matches(file))
        .filter((file) => !PROBE_IGNORES.some((ignore) => ignore(file)))
        .sort();
    },
    packageJson: packageJson ? JSON.parse(packageJson) : null,
    run: async () => ({ code: 1 }),
  };
}

export async function describeCheck(check: Check): Promise<CheckEntry> {
  const empty = makeProbe(EMPTY_FILES);
  const bare = makeProbe(BARE_FILES);
  const results = [await check.run(empty), await check.run(bare)];
  const howToPass =
    results.find(
      (result) =>
        (result.status === "fail" || result.status === "warn") && result.fix,
    )?.fix ?? null;

  let fixCreates: string[] = [];
  if (check.fix) {
    const emptyPlan = await check.fix(empty);
    const plan = emptyPlan.length > 0 ? emptyPlan : await check.fix(bare);
    fixCreates = [...new Set(plan.map((file) => file.path))];
  }

  return {
    id: check.id,
    title: check.title,
    category: check.category,
    weight: check.weight,
    why: check.why,
    howToPass,
    fixCreates,
  };
}

export async function buildCheckCatalog(
  checks: readonly Check[] = builtinChecks,
): Promise<CheckEntry[]> {
  return Promise.all(checks.map(describeCheck));
}

export function gradeBands(): Array<{
  grade: Grade;
  min: number;
  max: number;
}> {
  const grades: Grade[] = ["A", "B", "C", "D"];
  return grades.map((grade) => {
    const scores = Array.from({ length: 101 }, (_, score) => score).filter(
      (score) => gradeFor(score) === grade,
    );
    return { grade, min: scores[0]!, max: scores.at(-1)! };
  });
}
