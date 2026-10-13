import { computeScore, SCORING_VERSION } from "@oh-my-otter/core";
import { builtinChecks } from "@oh-my-otter/checks";
import { BUILTIN_TASK_VERSIONS, type ReportPayload } from "./payload";

function coreOf(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Cheap consistency checks that catch sloppy or fake reports. Returns
 * human-readable problems (field names only); empty means plausible.
 * A determined person can still fabricate a plausible run — this is a
 * sanity screen, not authentication.
 */
export function checkReportPlausibility(
  payload: ReportPayload,
  ctx: { latestCliVersion: string; today: Date },
): string[] {
  const problems: string[] = [];

  const bundled = BUILTIN_TASK_VERSIONS[payload.task_id];
  if (bundled !== undefined && payload.task_version > bundled) {
    problems.push(
      "task_version is newer than the task version bundled with omot",
    );
  }

  if (payload.scoring_version === SCORING_VERSION) {
    const weights = new Map(
      builtinChecks.map((check) => [check.id, check.weight]),
    );
    const results = Object.entries(payload.checks)
      .filter(
        (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
          entry[1] !== undefined,
      )
      .map(([id, status]) => ({
        weight: weights.get(id) ?? 0,
        status,
      }));
    if (computeScore(results).score !== payload.readiness_score) {
      problems.push(
        "readiness_score doesn't match the score computed from checks",
      );
    }
  }

  const reportCore = coreOf(payload.cli_version);
  const latestCore = coreOf(ctx.latestCliVersion);
  if (
    reportCore !== null &&
    latestCore !== null &&
    reportCore.some((part, i) => part !== latestCore[i])
  ) {
    const [a, b, c] = reportCore;
    const [x, y, z] = latestCore;
    if (a! > x! || (a === x && (b! > y! || (b === y && c! > z!)))) {
      problems.push("cli_version is newer than the latest released omot");
    }
  }

  const horizon = new Date(ctx.today.getTime() + 86_400_000);
  if (payload.submitted_on > utcDate(horizon)) {
    problems.push("submitted_on is in the future");
  }

  return problems;
}
