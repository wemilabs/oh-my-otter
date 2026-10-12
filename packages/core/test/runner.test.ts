import { describe, expect, it } from "vitest";
import type { Check, CheckContext } from "../src/types";
import {
  collectFixPlans,
  isRunDisabledError,
  runChecks,
  RunDisabledError,
} from "../src/runner";

const context = {} as CheckContext;

function makeCheck(id: string, run: Check["run"], fix?: Check["fix"]): Check {
  return {
    id,
    title: id,
    category: "setup",
    weight: 1,
    why: "This check is useful.",
    run,
    ...(fix ? { fix } : {}),
  };
}

describe("runChecks", () => {
  it("runs sequentially and converts errors or invalid results to fail", async () => {
    const order: number[] = [];
    const report = await runChecks(
      [
        makeCheck("first", async () => {
          order.push(1);
          return { status: "pass" };
        }),
        makeCheck("broken", async () => {
          order.push(2);
          throw new Error("oops");
        }),
        makeCheck("invalid", async () => {
          order.push(3);
          return { status: "unexpected" } as never;
        }),
      ],
      context,
    );
    expect(order).toEqual([1, 2, 3]);
    expect(report.outcomes.map(({ result }) => result.status)).toEqual([
      "pass",
      "fail",
      "fail",
    ]);
    expect(report.outcomes[1]?.result.detail).toBe("Check errored: oops");
    expect(report.outcomes[2]?.result.detail).toContain("Check errored:");
  });
});

describe("collectFixPlans", () => {
  it("collects fixes for fail and warn outcomes and dedupes paths first-wins", async () => {
    const outcomes = [
      {
        check: makeCheck(
          "first",
          async () => ({ status: "fail" }),
          async () => [
            { path: "first.txt", contents: "first" },
            { path: "shared.txt", contents: "first" },
          ],
        ),
        result: { status: "fail" as const },
        durationMs: 0,
      },
      {
        check: makeCheck(
          "second",
          async () => ({ status: "warn" }),
          async () => [
            { path: "shared.txt", contents: "second" },
            { path: "second.txt", contents: "second" },
          ],
        ),
        result: { status: "warn" as const },
        durationMs: 0,
      },
      {
        check: makeCheck(
          "pass",
          async () => ({ status: "pass" }),
          async () => [{ path: "ignored.txt", contents: "ignored" }],
        ),
        result: { status: "pass" as const },
        durationMs: 0,
      },
    ];
    expect(await collectFixPlans(outcomes, context)).toEqual([
      {
        checkId: "first",
        files: [
          { path: "first.txt", contents: "first" },
          { path: "shared.txt", contents: "first" },
        ],
      },
      {
        checkId: "second",
        files: [{ path: "second.txt", contents: "second" }],
      },
    ]);
  });

  it("rejects an invalid fix plan", async () => {
    const outcome = {
      check: makeCheck(
        "bad-plan",
        async () => ({ status: "fail" }),
        async () => [{ path: "", contents: "bad" }],
      ),
      result: { status: "fail" as const },
      durationMs: 0,
    };
    await expect(collectFixPlans([outcome], context)).rejects.toThrow();
  });
});

describe("RunDisabledError", () => {
  it("is identifiable", () => {
    expect(isRunDisabledError(new RunDisabledError())).toBe(true);
    expect(isRunDisabledError(new Error())).toBe(false);
  });
});
