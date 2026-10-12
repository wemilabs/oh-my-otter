import type { CheckStatus, Grade, ScoreSummary } from "./types";
import { SCORING_VERSION } from "./types";

export function gradeFor(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  return "D";
}

export function computeScore(
  results: ReadonlyArray<{ weight: number; status: CheckStatus }>,
): ScoreSummary {
  let earned = 0;
  let possible = 0;

  for (const { weight, status } of results) {
    if (status === "pass") {
      earned += weight;
      possible += weight;
    } else if (status === "warn") {
      earned += weight / 2;
      possible += weight / 2;
    } else if (status === "fail") {
      possible += weight;
    }
  }

  const score = possible === 0 ? 0 : Math.round((100 * earned) / possible);
  return {
    scoring_version: SCORING_VERSION,
    score,
    grade: gradeFor(score),
    earned,
    possible,
  };
}
