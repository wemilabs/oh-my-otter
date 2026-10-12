import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCheckContext } from "@oh-my-otter/core/node";
import { builtinChecks } from "../src";
import { describe, expect, it } from "vitest";

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

const expectedStatuses = {
  healthy: {
    "package-manager-lockfile": "pass",
    "node-version-pinned": "pass",
    "install-documented": "pass",
    "test-script": "pass",
    "tests-exist": "pass",
    "tests-pass": "na",
    "lint-script": "pass",
    "typecheck-script": "pass",
    "build-script": "pass",
    "ci-config": "pass",
    "env-example": "pass",
    "formatter-config": "pass",
    "contributing-or-agents-doc": "pass",
    "gitignore-sane": "pass",
  },
  bare: {
    "package-manager-lockfile": "fail",
    "node-version-pinned": "fail",
    "install-documented": "fail",
    "test-script": "fail",
    "tests-exist": "fail",
    "tests-pass": "na",
    "lint-script": "fail",
    "typecheck-script": "na",
    "build-script": "fail",
    "ci-config": "fail",
    "env-example": "na",
    "formatter-config": "fail",
    "contributing-or-agents-doc": "fail",
    "gitignore-sane": "warn",
  },
  monorepo: {
    "package-manager-lockfile": "pass",
    "node-version-pinned": "pass",
    "install-documented": "pass",
    "test-script": "pass",
    "tests-exist": "pass",
    "tests-pass": "na",
    "lint-script": "pass",
    "typecheck-script": "pass",
    "build-script": "pass",
    "ci-config": "fail",
    "env-example": "fail",
    "formatter-config": "fail",
    "contributing-or-agents-doc": "pass",
    "gitignore-sane": "pass",
  },
} as const;

describe("fixture scans", () => {
  it.each([
    ["healthy", 100, "A"],
    ["bare", 3, "D"],
    ["monorepo", 81, "B"],
  ] as const)(
    "matches %s statuses and score",
    async (fixture, score, grade) => {
      const context = createCheckContext(path.join(fixtureRoot, fixture));
      const outcomes = [];
      for (const check of builtinChecks) {
        outcomes.push({
          check,
          result: await check.run(context),
        });
      }
      const statusMap = Object.fromEntries(
        outcomes.map(({ check, result }) => [check.id, result.status]),
      );
      expect(statusMap).toEqual(expectedStatuses[fixture]);

      const points = outcomes.map(({ check, result }) => ({
        weight: check.weight,
        status: result.status,
      }));
      let earned = 0;
      let possible = 0;
      for (const point of points) {
        if (point.status === "pass") {
          earned += point.weight;
          possible += point.weight;
        } else if (point.status === "warn") {
          earned += point.weight / 2;
          possible += point.weight / 2;
        } else if (point.status === "fail") {
          possible += point.weight;
        }
      }
      expect(Math.round((100 * earned) / possible)).toBe(score);
      expect(grade).toBe(
        score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : "D",
      );
    },
  );
});
