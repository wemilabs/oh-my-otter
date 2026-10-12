import { z } from "zod";
import {
  AGENT_PATTERN,
  AGENT_VERSION_PATTERN,
  MODEL_PATTERN,
  type RunFile,
} from "../schema";
import { checkStatusSchema, BUILTIN_CHECK_IDS, stackSchema } from "./scan";
import type { ScanSummary } from "./scan";
import depPatchBump from "../tasks/dep-patch-bump/task.json";
import addUnitTest from "../tasks/add-unit-test/task.json";
import fixLintRule from "../tasks/fix-lint-rule/task.json";
import a11yImgAlt from "../tasks/a11y-img-alt/task.json";
import tsStrictFile from "../tasks/ts-strict-file/task.json";
import fixFailingTest from "../tasks/fix-failing-test/task.json";

export const REPORT_SCHEMA_VERSION = 1 as const;

export const BUILTIN_TASK_IDS = [
  depPatchBump.id,
  addUnitTest.id,
  fixLintRule.id,
  a11yImgAlt.id,
  tsStrictFile.id,
  fixFailingTest.id,
] as [string, ...string[]];

export { checkStatusSchema, stackSchema } from "./scan";

export const reportPayloadSchema = z
  .object({
    schema_version: z.literal(REPORT_SCHEMA_VERSION),
    cli_version: z
      .string()
      .max(32)
      .regex(/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/),
    scoring_version: z.number().int().min(1),
    task_id: z.enum(BUILTIN_TASK_IDS),
    task_version: z.number().int().min(1),
    agent: z.string().regex(AGENT_PATTERN),
    agent_version: z.string().regex(AGENT_VERSION_PATTERN).optional(),
    model: z.string().regex(MODEL_PATTERN).optional(),
    outcome: z.enum(["pass", "partial", "fail"]),
    human_corrections: z.number().int().min(0).max(100_000),
    human_minutes: z.number().int().min(0).max(100_000),
    attempts: z.number().int().min(1).max(100_000),
    readiness_score: z.number().int().min(0).max(100),
    checks: z.partialRecord(z.enum(BUILTIN_CHECK_IDS), checkStatusSchema),
    stack: stackSchema,
    submitted_on: z.iso.date(),
  })
  .strict();

export type ReportPayload = z.infer<typeof reportPayloadSchema>;

export const EXAMPLE_REPORT_PAYLOAD: ReportPayload = {
  schema_version: 1,
  cli_version: "0.3.0",
  scoring_version: 1,
  task_id: "add-unit-test",
  task_version: 1,
  agent: "claude-code",
  agent_version: "2.1.0",
  model: "claude-opus-4",
  outcome: "pass",
  human_corrections: 1,
  human_minutes: 12,
  attempts: 1,
  readiness_score: 82,
  checks: {
    "test-script": "pass",
    "lint-script": "fail",
    "tests-pass": "na",
  },
  stack: {
    package_manager: "pnpm",
    language: "typescript",
    framework: "nextjs",
  },
  submitted_on: "2026-10-10",
};

export interface BuildReportOptions {
  cliVersion: string;
  today: Date;
}

export function buildReportPayload(
  run: RunFile,
  scan: ScanSummary,
  options: BuildReportOptions,
): ReportPayload {
  if (!run.result) {
    throw new Error(
      "This run hasn't been verified yet; run omot bench verify first.",
    );
  }
  const payload = {
    schema_version: REPORT_SCHEMA_VERSION,
    cli_version: options.cliVersion,
    scoring_version: scan.scoring_version,
    task_id: run.task.id,
    task_version: run.task.version,
    agent: run.agent,
    ...(run.agent_version === undefined
      ? {}
      : { agent_version: run.agent_version }),
    ...(run.model === undefined ? {} : { model: run.model }),
    outcome: run.result.outcome,
    human_corrections: run.result.human_corrections,
    human_minutes: run.result.human_minutes,
    attempts: run.result.attempts,
    readiness_score: scan.readiness_score,
    checks: scan.checks,
    stack: scan.stack,
    submitted_on: options.today.toISOString().slice(0, 10),
  };
  return reportPayloadSchema.parse(payload);
}

export function serializeReportPayload(payload: ReportPayload): string {
  const parsed = reportPayloadSchema.parse(payload);
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(reportPayloadSchema.shape)) {
    if (key in parsed) ordered[key] = parsed[key as keyof ReportPayload];
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
