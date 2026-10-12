import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Command } from "commander";
import type { Grade } from "@oh-my-otter/core";
import { runChecks } from "@oh-my-otter/core";
import { createCheckContext } from "@oh-my-otter/core/node";
import { builtinChecks } from "@oh-my-otter/checks";
import {
  detectStack,
  readRunFile,
  resolveRepoRoot,
  runGit,
  summarizeScan,
} from "@oh-my-otter/benchmarks";
import {
  buildReportPayload,
  serializeReportPayload,
} from "@oh-my-otter/benchmarks/report";
import type { ScanSummary } from "@oh-my-otter/benchmarks/report";
import { z } from "zod";
import type { CliIO } from "./cli";

export const REPORT_REPO_URL = "https://github.com/wemilabs/oh-my-otter";
export const MAX_ISSUE_URL_LENGTH = 8000;

interface ReportOptions {
  dryRun?: boolean;
}

export interface ReportInternalOptions {
  maxUrlLength?: number;
  cliVersion: string;
}

interface BaselineScan {
  summary: ScanSummary;
  score: number;
  grade: Grade;
}

/** Scans a repo root with the built-in checks and summarizes it for a report. */
export async function scanBaseline(root: string): Promise<BaselineScan> {
  const ctx = createCheckContext(root);
  const report = await runChecks(builtinChecks, ctx);
  const stack = await detectStack(ctx);
  return {
    summary: summarizeScan(report, stack),
    score: report.score.score,
    grade: report.score.grade,
  };
}

async function scanBaselineCommit(
  root: string,
  commit: string,
): Promise<{ summary: ScanSummary; hasSubmodules: boolean }> {
  const dir = await mkdtemp(path.join(tmpdir(), "omot-baseline-"));
  try {
    await runGit(root, ["worktree", "add", "--detach", dir, commit]);
    try {
      const hasSubmodules = existsSync(path.join(dir, ".gitmodules"));
      return { summary: (await scanBaseline(dir)).summary, hasSubmodules };
    } finally {
      await runGit(root, ["worktree", "remove", "--force", dir]);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function reportIssueUrl(json: string, title: string): string {
  const params = new URLSearchParams({
    template: "report.yml",
    title,
    payload: json,
  });
  return `${REPORT_REPO_URL}/issues/new?${params.toString()}`;
}

export function reportTemplateUrl(title: string): string {
  const params = new URLSearchParams({ template: "report.yml", title });
  return `${REPORT_REPO_URL}/issues/new?${params.toString()}`;
}

export async function runReport(
  target: string | undefined,
  options: ReportOptions,
  io: CliIO,
  internal: ReportInternalOptions,
): Promise<number> {
  const root = await resolveRepoRoot(path.resolve(io.cwd, target ?? "."));
  const run = await readRunFile(root);
  if (!run.result) {
    io.stderr(
      "This run hasn't been verified yet; run omot bench verify first.\n",
    );
    return 1;
  }

  let scan = run.baseline.scan;
  if (scan === undefined) {
    io.stderr(
      `This run was started with an older omot that didn't record readiness at start; scanning the baseline commit ${run.baseline.commit.slice(0, 12)} instead.\n`,
    );
    try {
      const baseline = await scanBaselineCommit(root, run.baseline.commit);
      scan = baseline.summary;
      if (baseline.hasSubmodules) {
        io.stderr(
          "Submodules aren't checked out for this rescan, so checks that depend on them may differ.\n",
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      io.stderr(
        `Could not scan the baseline commit (${reason}); start a new run with this omot.\n`,
      );
      return 1;
    }
  }

  let payload;
  try {
    payload = buildReportPayload(run, scan, {
      cliVersion: internal.cliVersion,
      today: io.now(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const field =
        issue === undefined || issue.path.length === 0
          ? "payload"
          : issue.path.join(".");
      const message = issue?.message ?? "invalid value";
      io.stderr(`Can't report this run: ${field}: ${message}\n`);
      return 1;
    }
    throw error;
  }
  const json = serializeReportPayload(payload);
  io.stderr("This is the exact data omot report would submit:\n");
  io.stdout(json);

  if (options.dryRun) {
    io.stderr("Dry run: nothing was sent.\n");
    return 0;
  }
  if (!io.isTTY) {
    io.stderr(
      "Not submitted: confirming needs an interactive terminal. Re-run in a terminal, or use --dry-run to only print.\n",
    );
    return 1;
  }
  if (!(await io.confirm("Open a GitHub issue to submit this report?"))) {
    io.stderr("Not submitted.\n");
    return 0;
  }

  const title = `Benchmark report: ${payload.task_id} (${payload.outcome})`;
  const url = reportIssueUrl(json, title);
  const maxUrlLength = internal.maxUrlLength ?? MAX_ISSUE_URL_LENGTH;
  if (url.length <= maxUrlLength) {
    try {
      await io.openUrl(url);
      io.stderr(
        "Opened a prefilled issue in your browser. Review it and click Create to submit; nothing is sent until you do.\n",
      );
    } catch {
      io.stderr(`Couldn't open a browser. Open this URL to submit:\n${url}\n`);
    }
    return 0;
  }

  const templateUrl = reportTemplateUrl(title);
  try {
    await io.copyToClipboard(json);
    try {
      await io.openUrl(templateUrl);
      io.stderr(
        'The report is too long for a URL, so it was copied to your clipboard. Paste it into the "Report payload" field.\n',
      );
    } catch {
      io.stderr(
        `The report is too long for a URL, so it was copied to your clipboard. Paste it into the "Report payload" field at:\n${templateUrl}\n`,
      );
    }
  } catch {
    io.stderr(
      `Couldn't copy to the clipboard. Copy the JSON printed above manually and paste it into the "Report payload" field at:\n${templateUrl}\n`,
    );
  }
  return 0;
}

export function addReportCommand(
  program: Command,
  io: CliIO,
  setExitCode: (code: number) => void,
  internal: ReportInternalOptions,
): void {
  program
    .command("report [path]")
    .description(
      "Preview and submit an anonymous benchmark result (nothing is sent without confirmation)",
    )
    .option("--dry-run", "Print the report payload without submitting")
    .action(async (target: string | undefined, options: ReportOptions) => {
      setExitCode(await runReport(target, options, io, internal));
    });
}
