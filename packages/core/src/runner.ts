import { computeScore } from "./scoring";
import { checkResultSchema, fixPlanSchema } from "./schema";
import type {
  Check,
  CheckContext,
  CheckResult,
  FixPlan,
  ScoreSummary,
} from "./types";

export interface CheckOutcome {
  check: Check;
  result: CheckResult;
  durationMs: number;
}

export interface ScanReport {
  outcomes: CheckOutcome[];
  score: ScoreSummary;
}

export class RunDisabledError extends Error {
  constructor() {
    super("Running repository commands is disabled");
    this.name = "RunDisabledError";
  }
}

export function isRunDisabledError(error: unknown): error is RunDisabledError {
  return error instanceof RunDisabledError;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runChecks(
  checks: readonly Check[],
  ctx: CheckContext,
): Promise<ScanReport> {
  const outcomes: CheckOutcome[] = [];
  for (const check of checks) {
    const started = performance.now();
    let result: CheckResult;
    try {
      const candidate: unknown = await check.run(ctx);
      result = checkResultSchema.parse(candidate) as CheckResult;
    } catch (error) {
      result = {
        status: "fail",
        detail: `Check errored: ${errorMessage(error)}`,
      };
    }
    outcomes.push({
      check,
      result,
      durationMs: performance.now() - started,
    });
  }

  return {
    outcomes,
    score: computeScore(
      outcomes.map(({ check, result: checkResult }) => ({
        weight: check.weight,
        status: checkResult.status,
      })),
    ),
  };
}

export async function collectFixPlans(
  outcomes: readonly CheckOutcome[],
  ctx: CheckContext,
): Promise<{ checkId: string; files: FixPlan }[]> {
  const plans: { checkId: string; files: FixPlan }[] = [];
  const seenPaths = new Set<string>();

  for (const { check, result } of outcomes) {
    if (
      (result.status !== "fail" && result.status !== "warn") ||
      typeof check.fix !== "function"
    ) {
      continue;
    }
    const files = fixPlanSchema.parse(await check.fix(ctx)) as FixPlan;
    const uniqueFiles = files.filter((file) => {
      if (seenPaths.has(file.path)) return false;
      seenPaths.add(file.path);
      return true;
    });
    plans.push({ checkId: check.id, files: uniqueFiles });
  }

  return plans;
}
