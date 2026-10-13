import { access, lstat, readFile, rmdir } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { z } from "zod";
import {
  OMOT_IGNORE_LINE,
  RUN_FILE,
  RUN_SCHEMA_VERSION,
  applyGitignore,
  builtinTasks,
  createPrepareContext,
  createVerifyContext,
  getTask,
  headCommit,
  normalizeAgent,
  normalizeAgentVersion,
  normalizeModel,
  parseParams,
  planGitignore,
  assertRunFileUnchanged,
  removeRunFileUnlocked,
  removeStaleRunFileLock,
  readRunFile,
  readRunFileSnapshot,
  renderPrompt,
  resolveRepoRoot,
  appendVerification,
  replaceRunFile,
  updateRunFile,
  TaskPreconditionError,
  runGit,
  withRunFileLock,
  withoutOmotLines,
  type RunFile,
  type Task,
  type VerifyResult,
} from "@oh-my-otter/benchmarks";
import { scanBaseline } from "./report";

export interface BenchIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  isTTY: boolean;
  confirm: (question: string) => Promise<boolean>;
  ask: (question: string) => Promise<string>;
}

interface AgentOptions {
  agent?: string;
  agentVersion?: string;
  model?: string;
}

interface StartOptions extends AgentOptions {
  param?: string[];
  skipBaselineScripts?: boolean;
  branch?: string;
  yes?: boolean;
}

interface CleanOptions {
  deleteBranch?: boolean;
  yes?: boolean;
}

interface ShowOptions {
  param?: string[];
  json?: boolean;
}

interface VerifyOptions extends AgentOptions {
  corrections?: string;
  minutes?: string;
  json?: boolean;
}

export const PASTE_HEADING = "Paste this into your coding agent:";
const selfReportSchema = z.coerce.number().int().min(0).max(100_000);

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function requireTask(id: string): Task {
  const task = getTask(id);
  if (!task) {
    const ids = builtinTasks.map((entry) => entry.manifest.id).join(", ");
    throw new Error(`Unknown task "${id}". Available tasks: ${ids}.`);
  }
  return task;
}

function paramUsage(task: Task, values: Record<string, string> = {}): string {
  return task.manifest.params
    .map(
      (param) => `--param ${param.name}=${values[param.name] ?? param.example}`,
    )
    .join(" ");
}

function outcomeLabel(outcome: VerifyResult["outcome"]): string {
  if (outcome === "pass") return pc.green("PASS");
  if (outcome === "partial") return pc.yellow("PARTIAL");
  return pc.red("FAIL");
}

function parseSelfReport(name: string, value: string): number {
  const parsed = selfReportSchema.safeParse(value.trim());
  if (!parsed.success || value.trim() === "") {
    throw new Error(
      `${name} must be a whole number from 0 to 100000, got "${value}".`,
    );
  }
  return parsed.data;
}

type AgentFields = Pick<RunFile, "agent" | "agent_version" | "model">;

function agentFields(
  options: AgentOptions,
  previous?: AgentFields,
): AgentFields {
  const agent =
    options.agent === undefined
      ? (previous?.agent ?? normalizeAgent(undefined))
      : normalizeAgent(options.agent);
  const agentVersion =
    options.agentVersion === undefined
      ? previous?.agent_version
      : normalizeAgentVersion(options.agentVersion);
  const model =
    options.model === undefined
      ? previous?.model
      : normalizeModel(options.model);
  return {
    agent,
    ...(agentVersion === undefined ? {} : { agent_version: agentVersion }),
    ...(model === undefined ? {} : { model }),
  };
}

function describeAgent(fields: AgentFields): string {
  return [
    `agent: ${fields.agent}`,
    fields.agent_version === undefined
      ? null
      : `version: ${fields.agent_version}`,
    fields.model === undefined ? null : `model: ${fields.model}`,
  ]
    .filter((part) => part !== null)
    .join(", ");
}

async function branchExists(root: string, branch: string): Promise<boolean> {
  try {
    await runGit(root, [
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${branch}`,
    ]);
    return true;
  } catch {
    return false;
  }
}

async function currentBranchRef(root: string): Promise<string | null> {
  try {
    return (await runGit(root, ["symbolic-ref", "--quiet", "HEAD"])).trim();
  } catch {
    return null;
  }
}

async function validateNewBranch(root: string, branch: string): Promise<void> {
  try {
    await runGit(root, ["check-ref-format", "--branch", branch]);
  } catch {
    throw new Error(`Invalid branch name: ${branch}.`);
  }
  if (await branchExists(root, branch)) {
    throw new Error(
      `Branch ${branch} already exists; pick another name or drop --branch.`,
    );
  }
}

async function preconditionScriptHint(
  cwd: string,
  target: string | undefined,
  task: Task,
): Promise<string[]> {
  try {
    const root = await resolveRepoRoot(path.resolve(cwd, target ?? "."));
    const pkg = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    ) as { scripts?: unknown };
    if (
      pkg.scripts === null ||
      typeof pkg.scripts !== "object" ||
      Array.isArray(pkg.scripts)
    ) {
      return [];
    }
    const scripts = pkg.scripts as Record<string, unknown>;
    return task.scripts.flatMap((name) => {
      if (typeof scripts[name] === "string" && scripts[name].trim()) return [];
      const pattern = new RegExp(
        `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[:_-]`,
      );
      const matches = Object.keys(scripts).filter((script) =>
        pattern.test(script),
      );
      if (matches.length === 0) return [];
      return [
        `Found ${matches.join(", ")}; omot runs scripts.${name}, so add "${name}": "npm run ${matches[0]}" (pick the suite to measure).`,
      ];
    });
  } catch {
    return [];
  }
}

function agentNote(
  options: AgentOptions,
  fields: AgentFields,
  io: BenchIO,
): void {
  const notes: [string, string | undefined, string | undefined][] = [
    ["Agent", options.agent, fields.agent],
    ["Agent version", options.agentVersion, fields.agent_version],
    ["Model", options.model, fields.model],
  ];
  for (const [label, raw, value] of notes) {
    if (raw === undefined || raw === value) continue;
    io.stderr(
      pc.dim(
        value === undefined
          ? `${label} "${raw}" ignored (nothing left after normalizing).\n`
          : `${label} "${raw}" recorded as "${value}".\n`,
      ),
    );
  }
}

function listTasks(json: boolean | undefined, io: BenchIO): number {
  if (json) {
    const tasks = builtinTasks.map((task) => task.manifest);
    io.stdout(`${JSON.stringify({ tasks }, null, 2)}\n`);
    return 0;
  }
  const lines = builtinTasks.map((task) =>
    `${pc.bold(task.manifest.id)} v${task.manifest.version} · ${task.manifest.title} (${task.manifest.category}, ${task.manifest.estimatedScope})\n  omot bench start ${task.manifest.id} ${paramUsage(task)}`.trimEnd(),
  );
  io.stdout(`${lines.join("\n")}\n`);
  return 0;
}

function showTask(id: string, options: ShowOptions, io: BenchIO): number {
  const task = requireTask(id);
  const params =
    (options.param ?? []).length > 0
      ? parseParams(task.manifest, options.param ?? [])
      : {};
  const prompt = renderPrompt(task.prompt, params);
  if (options.json) {
    io.stdout(`${JSON.stringify({ task: task.manifest, prompt }, null, 2)}\n`);
    return 0;
  }
  const { manifest } = task;
  const lines = [
    `${pc.bold(manifest.id)} v${manifest.version} · ${manifest.title}`,
    `Category: ${manifest.category} · Scope: ${manifest.estimatedScope}`,
    "",
    "Params:",
    ...(manifest.params.length > 0
      ? manifest.params.map(
          (param) =>
            `  ${param.name} (${param.kind}): ${param.description} e.g. ${param.example}`,
        )
      : ["  none"]),
    "",
    "Preconditions:",
    ...manifest.preconditions.map((entry) => `  - ${entry}`),
    "",
    "Outcomes:",
    `  pass: ${manifest.criteria.pass}`,
    `  partial: ${manifest.criteria.partial}`,
    `  fail: ${manifest.criteria.fail}`,
    "",
    `Start: omot bench start ${manifest.id} ${paramUsage(task, params)}`.trimEnd(),
    "",
    PASTE_HEADING,
    "",
    prompt.trimEnd(),
  ];
  io.stdout(`${lines.join("\n")}\n`);
  return 0;
}

async function ensureGitignore(
  root: string,
  yes: boolean,
  io: BenchIO,
): Promise<void> {
  const plan = await planGitignore(root);
  if (plan.action === "none") return;
  if (plan.action === "skip") {
    io.stderr(pc.yellow(`${plan.reason}\n`));
    return;
  }
  const change =
    plan.action === "create"
      ? `create .gitignore containing ${OMOT_IGNORE_LINE}`
      : `append the line ${OMOT_IGNORE_LINE} to .gitignore`;
  let apply = yes;
  if (!apply && io.isTTY) {
    apply = await io.confirm(
      `omot stores run data in .omot/. ${change[0]?.toUpperCase()}${change.slice(1)}?`,
    );
  }
  if (!apply) {
    io.stderr(
      pc.dim(
        `Did not change .gitignore; add ${OMOT_IGNORE_LINE} yourself, or re-run with --yes to ${change}.\n`,
      ),
    );
    return;
  }
  await applyGitignore(root, plan);
  io.stderr(
    pc.dim(
      `Added ${OMOT_IGNORE_LINE} to .gitignore; .gitignore was left uncommitted, and verify ignores the change.\n`,
    ),
  );
}

async function startTask(
  id: string,
  target: string | undefined,
  options: StartOptions,
  io: BenchIO,
): Promise<number> {
  if (id === "fix-failing-test" && options.branch !== undefined) {
    throw new Error(
      "fix-failing-test creates its own omot/fix-failing-test-* branch; drop --branch.",
    );
  }
  const task = requireTask(id);
  const params = parseParams(task.manifest, options.param ?? []);
  const fields = agentFields(options);
  const root = await resolveRepoRoot(path.resolve(io.cwd, target ?? "."));
  if (options.branch !== undefined) {
    await validateNewBranch(root, options.branch);
  }
  const head = await headCommit(root);
  const dirty = await createVerifyContext(root, {
    commit: head,
    data: undefined,
  }).changedFiles();
  if (dirty.length > 0) {
    const files = dirty.map((file) => file.path);
    throw new Error(
      `The working tree has uncommitted changes (${files.slice(0, 5).join(", ")}${files.length > 5 ? ", ..." : ""}); commit or stash them first so the baseline matches your files.`,
    );
  }

  const hasRun = await access(path.join(root, RUN_FILE)).then(
    () => true,
    () => false,
  );
  const previous = hasRun ? await readRunFile(root).catch(() => null) : null;
  const conflict = !hasRun
    ? null
    : previous === null
      ? `${RUN_FILE} exists but is not a valid run file`
      : `${RUN_FILE} already has a ${previous.task.id} run (${previous.verifications.length} attempts)`;
  if (conflict && !options.yes) {
    if (!io.isTTY) {
      throw new Error(`${conflict}; re-run with --yes to replace it.`);
    }
    if (!(await io.confirm(`${conflict}. Replace it?`))) {
      io.stderr("Cancelled.\n");
      return 1;
    }
  }

  const originalRef =
    options.branch === undefined ? null : await currentBranchRef(root);
  const originalBranch =
    options.branch === undefined
      ? undefined
      : originalRef?.startsWith("refs/heads/")
        ? originalRef.slice("refs/heads/".length)
        : "HEAD";
  const startedAt = new Date().toISOString();
  if (options.branch !== undefined) {
    await runGit(root, ["switch", "--quiet", "-c", options.branch]);
  }
  try {
    if (options.branch !== undefined) {
      await runGit(root, [
        "config",
        "--local",
        `branch.${options.branch}.omot-run`,
        startedAt,
      ]);
    }
    const baselineScan = await scanBaseline(root);
    io.stderr(
      pc.dim(
        `Readiness at start: ${baselineScan.score} · ${baselineScan.grade}\n`,
      ),
    );

    const ctx = createPrepareContext(root, {
      params,
      scripts: task.scripts,
      skipBaselineScripts: Boolean(options.skipBaselineScripts),
      yes: Boolean(options.yes),
      isTTY: io.isTTY,
      confirm: io.confirm,
      log: (text) => io.stderr(pc.dim(`${text}\n`)),
    });
    const data = task.prepare ? await task.prepare(ctx) : undefined;
    if (
      task.manifest.id === "fix-failing-test" &&
      typeof data === "object" &&
      data !== null &&
      "branch" in data &&
      typeof data.branch === "string"
    ) {
      await runGit(root, [
        "config",
        "--local",
        `branch.${data.branch}.omot-run`,
        startedAt,
      ]);
    }
    const baselineScripts = await ctx.recordBaseline();
    if (baselineScripts === null) {
      io.stderr(
        pc.dim(
          "Baseline scripts skipped; verify will report baseline health as unknown.\n",
        ),
      );
    } else {
      const summary = Object.entries(baselineScripts)
        .map(([name, result]) => `${name} exit ${result.code}`)
        .join(", ");
      io.stderr(pc.dim(`Baseline scripts: ${summary || "none available"}\n`));
    }
    const commit = await headCommit(root);
    await ensureGitignore(root, Boolean(options.yes), io);
    const run: RunFile = {
      schema_version: RUN_SCHEMA_VERSION,
      task: { id: task.manifest.id, version: task.manifest.version },
      params,
      ...fields,
      baseline: {
        commit,
        started_at: startedAt,
        ...(data === undefined ? {} : { data }),
        ...(options.branch === undefined
          ? {}
          : {
              branch: options.branch,
              original_branch: originalBranch!,
            }),
        ...(baselineScripts === null
          ? {}
          : {
              scripts: Object.fromEntries(
                Object.entries(baselineScripts).map(([name, result]) => [
                  name,
                  result.code,
                ]),
              ),
            }),
        scan: baselineScan.summary,
      },
      verifications: [],
    };
    await replaceRunFile(root, run);
    agentNote(options, fields, io);
    io.stderr(
      `Started ${pc.bold(task.manifest.id)} v${task.manifest.version} at ${commit.slice(0, 12)}${options.branch === undefined ? "" : ` on branch ${options.branch}`} (${describeAgent(fields)}). Baseline saved to ${RUN_FILE}.\n\n${PASTE_HEADING}\n\n`,
    );
    io.stdout(renderPrompt(task.prompt, params));
    io.stderr(`\nWhen the agent is done, run: omot bench verify\n`);
    return 0;
  } catch (error) {
    if (options.branch !== undefined && originalBranch !== undefined) {
      try {
        if (originalBranch === "HEAD") {
          await runGit(root, ["switch", "--quiet", "--detach", head]);
        } else {
          await runGit(root, ["switch", "--quiet", originalBranch]);
        }
        await runGit(root, ["branch", "-D", options.branch]);
      } catch {
        // Preserve the error that caused the start to fail.
      }
    }
    throw error;
  }
}

function omotBranch(run: RunFile): {
  branch: string;
  original: string;
  commit?: string;
  source: "baseline" | "fix-failing-test";
  startedAt: string;
} | null {
  if (
    typeof run.baseline.branch === "string" &&
    typeof run.baseline.original_branch === "string"
  ) {
    return {
      branch: run.baseline.branch,
      original: run.baseline.original_branch,
      commit: run.baseline.commit,
      source: "baseline",
      startedAt: run.baseline.started_at,
    };
  }
  if (
    run.task.id !== "fix-failing-test" ||
    typeof run.baseline.data !== "object" ||
    run.baseline.data === null
  ) {
    return null;
  }
  const data = run.baseline.data as Record<string, unknown>;
  if (
    typeof data.branch !== "string" ||
    typeof data.original_branch !== "string"
  ) {
    return null;
  }
  return {
    branch: data.branch,
    original: data.original_branch,
    ...(typeof data.original_commit === "string"
      ? { commit: data.original_commit }
      : {}),
    source: "fix-failing-test",
    startedAt: run.baseline.started_at,
  };
}

// Keep in sync with BASELINE_MESSAGE in packages/benchmarks/src/tasks/fix-failing-test/verify.ts.
const FIX_FAILING_TEST_BASELINE_MESSAGE = "bench baseline";

async function hasLegacyFixFailingTestProvenance(
  root: string,
  branch: string,
): Promise<boolean> {
  try {
    const branchRef = `refs/heads/${branch}`;
    const roots = (
      await runGit(root, ["rev-list", "--max-parents=0", branchRef])
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (roots.length !== 1) return false;
    const [rootCommit] = roots;
    if (!rootCommit) return false;
    const subject = await runGit(root, [
      "log",
      "-1",
      "--format=%s",
      rootCommit,
    ]);
    return subject.trim() === FIX_FAILING_TEST_BASELINE_MESSAGE;
  } catch {
    return false;
  }
}

async function isOmotBranch(
  root: string,
  branch: NonNullable<ReturnType<typeof omotBranch>>,
): Promise<boolean> {
  if (
    branch.branch === branch.original ||
    (branch.source === "fix-failing-test" &&
      !branch.branch.startsWith("omot/fix-failing-test-"))
  ) {
    return false;
  }
  try {
    const marker = await runGit(root, [
      "config",
      "--local",
      "--get",
      `branch.${branch.branch}.omot-run`,
    ]);
    if (marker.trim() !== branch.startedAt) return false;
    if (branch.source === "baseline") {
      if (!branch.commit) return false;
      await runGit(root, [
        "merge-base",
        "--is-ancestor",
        branch.commit,
        `refs/heads/${branch.branch}`,
      ]);
    }
    return true;
  } catch {
    return (
      branch.source === "fix-failing-test" &&
      hasLegacyFixFailingTestProvenance(root, branch.branch)
    );
  }
}

async function cleanRun(
  target: string | undefined,
  options: CleanOptions,
  io: BenchIO,
): Promise<number> {
  const root = await resolveRepoRoot(path.resolve(io.cwd, target ?? "."));
  const directory = path.join(root, ".omot");
  try {
    if ((await lstat(directory)).isSymbolicLink()) {
      throw new Error(".omot is a symbolic link; refusing to clean it.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const file = path.join(directory, "run.json");
  const lock = `${file}.lock`;
  const reportNoRun = async (): Promise<number> => {
    const removedLock = await removeStaleRunFileLock(root);
    if (!removedLock) {
      try {
        await access(lock);
        io.stdout(
          "Nothing to clean; a bench command holds .omot/run.json.lock.\n",
        );
        return 0;
      } catch (lockError) {
        if ((lockError as NodeJS.ErrnoException).code !== "ENOENT") {
          throw lockError;
        }
      }
    } else {
      try {
        await rmdir(directory);
      } catch (rmdirError) {
        if (
          !["ENOENT", "ENOTEMPTY"].includes(
            (rmdirError as NodeJS.ErrnoException).code ?? "",
          )
        ) {
          throw rmdirError;
        }
      }
    }
    io.stdout("Nothing to clean.\n");
    return 0;
  };
  try {
    await access(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return reportNoRun();
    }
    throw error;
  }

  let snapshot: Awaited<ReturnType<typeof readRunFileSnapshot>>;
  try {
    snapshot = await readRunFileSnapshot(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return reportNoRun();
    }
    throw error;
  }
  const run = snapshot.run;
  let branchInfo = run === null ? null : omotBranch(run);
  if (branchInfo && !(await branchExists(root, branchInfo.branch))) {
    branchInfo = null;
  }
  if (branchInfo && !(await isOmotBranch(root, branchInfo))) {
    if (options.deleteBranch) {
      throw new Error(
        `Refusing to delete ${branchInfo.branch}: it is not the branch omot created for this run.`,
      );
    }
    branchInfo = null;
  }

  const deleteBranch = Boolean(options.deleteBranch && branchInfo);
  if (deleteBranch && branchInfo) {
    const status = await runGit(root, [
      "status",
      "--porcelain",
      "--untracked-files=all",
    ]);
    const outside: string[] = [];
    for (const line of status.split(/\r?\n/)) {
      if (!line.trim() || line.slice(3).startsWith(".omot/")) continue;
      if (line.slice(3) === ".gitignore") {
        const current = await readFile(path.join(root, ".gitignore"), "utf8");
        if (line.startsWith("?? ")) {
          if (withoutOmotLines(current).trim() === "") continue;
        } else {
          try {
            const baseline = await runGit(root, ["show", "HEAD:.gitignore"]);
            if (withoutOmotLines(current) === withoutOmotLines(baseline)) {
              continue;
            }
          } catch {
            // An untracked or otherwise unavailable baseline is not omot-only.
          }
        }
      }
      outside.push(line);
    }
    if (outside.length > 0) {
      throw new Error(
        `The working tree has uncommitted changes outside .omot/; commit or stash them before deleting ${branchInfo.branch}.`,
      );
    }
  }

  const question = `Remove .omot/run.json${deleteBranch && branchInfo ? ` and delete branch ${branchInfo.branch}` : ""}?`;
  if (!options.yes) {
    if (!io.isTTY) {
      throw new Error(
        `${question.slice(0, -1)}; re-run with --yes to confirm.`,
      );
    }
    if (!(await io.confirm(question))) {
      io.stderr("Cancelled.\n");
      return 1;
    }
  }

  let switchedTo: string | null = null;
  const removed = await withRunFileLock(root, async () => {
    if (!(await assertRunFileUnchanged(root, snapshot.bytes))) return false;
    if (deleteBranch && branchInfo) {
      const currentRef = await currentBranchRef(root);
      if (currentRef === `refs/heads/${branchInfo.branch}`) {
        if (branchInfo.original === "HEAD") {
          if (!branchInfo.commit) {
            throw new Error(
              `Cannot restore the detached original commit before deleting ${branchInfo.branch}.`,
            );
          }
          await runGit(root, [
            "switch",
            "--quiet",
            "--detach",
            branchInfo.commit,
          ]);
          switchedTo = "HEAD";
        } else {
          await runGit(root, ["switch", "--quiet", branchInfo.original]);
          switchedTo = branchInfo.original;
        }
      }
      await runGit(root, ["branch", "-D", branchInfo.branch]);
    }
    await removeRunFileUnlocked(root);
    return true;
  });
  if (!removed) {
    try {
      await rmdir(directory);
    } catch (error) {
      if (
        !["ENOENT", "ENOTEMPTY"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      ) {
        throw error;
      }
    }
    io.stdout("Nothing to clean.\n");
    return 0;
  }
  if (deleteBranch && branchInfo) {
    io.stdout(
      `Deleted branch ${branchInfo.branch}${switchedTo ? `; now on ${switchedTo}` : ""}.\n`,
    );
  }

  io.stdout("Removed .omot/run.json.\n");
  try {
    await rmdir(directory);
  } catch (error) {
    if (
      !["ENOENT", "ENOTEMPTY"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    ) {
      throw error;
    }
  }

  if (options.deleteBranch && !branchInfo) {
    io.stdout("No omot-created branch to delete.\n");
  }

  if (!options.deleteBranch && branchInfo) {
    const currentRef = await currentBranchRef(root);
    const switchCommand =
      currentRef === `refs/heads/${branchInfo.branch}`
        ? branchInfo.original === "HEAD" && branchInfo.commit
          ? `git switch --detach ${branchInfo.commit} && `
          : `git switch ${branchInfo.original} && `
        : "";
    io.stderr(
      `Branch ${branchInfo.branch} was created by omot and was kept; to delete it, run ${switchCommand}git branch -D ${branchInfo.branch} (omot bench clean --delete-branch does this together with the cleanup).\n`,
    );
  }
  return 0;
}

async function askNumber(
  name: string,
  question: string,
  io: BenchIO,
): Promise<number> {
  const answer = await io.ask(question);
  return parseSelfReport(name, answer);
}

async function verifyRun(
  target: string | undefined,
  options: VerifyOptions,
  io: BenchIO,
): Promise<number> {
  const root = await resolveRepoRoot(path.resolve(io.cwd, target ?? "."));
  const run = await readRunFile(root);
  const task = requireTask(run.task.id);
  if (task.manifest.version !== run.task.version) {
    throw new Error(
      `This run used ${run.task.id} v${run.task.version}, but this omot has v${task.manifest.version}; start a new run.`,
    );
  }
  let corrections =
    options.corrections === undefined
      ? undefined
      : parseSelfReport("--corrections", options.corrections);
  let minutes =
    options.minutes === undefined
      ? undefined
      : parseSelfReport("--minutes", options.minutes);
  if ((corrections === undefined || minutes === undefined) && !io.isTTY) {
    throw new Error(
      "Pass --corrections <n> and --minutes <n> when not running interactively.",
    );
  }
  const fields = agentFields(options, run);
  const attempt = run.verifications.length + 1;

  if (!options.json)
    io.stderr(
      pc.dim(
        `Verifying ${task.manifest.id} against ${run.baseline.commit.slice(0, 12)}...\n`,
      ),
    );
  const ctx = createVerifyContext(
    root,
    {
      commit: run.baseline.commit,
      data: run.baseline.data,
      ...(run.baseline.scripts === undefined
        ? {}
        : { scripts: run.baseline.scripts }),
    },
    { params: run.params, log: (text) => io.stderr(pc.dim(`${text}\n`)) },
  );
  const result = await task.verify(ctx);
  const verifiedAt = new Date().toISOString();
  const verifiedCommit = await headCommit(root);
  if (!options.json) {
    io.stdout(
      run.baseline.scripts === undefined
        ? "Baseline health unknown (start ran with --skip-baseline-scripts or an older omot)\n"
        : "Baseline health recorded\n",
    );
    io.stdout(
      `${outcomeLabel(result.outcome)} ${task.manifest.id} v${task.manifest.version} (attempt ${attempt})\n${result.reasons
        .flatMap((reason) =>
          reason
            .split("\n")
            .map((line, index) =>
              index === 0 ? `  - ${line}` : `    ${line}`,
            ),
        )
        .join("\n")}\n`,
    );
  }

  corrections ??= await askNumber(
    "Human corrections",
    "How many times did you correct or redirect the agent? ",
    io,
  );
  minutes ??= await askNumber(
    "Human minutes",
    "How many minutes of human effort did the task take? ",
    io,
  );
  const entry = {
    outcome: result.outcome,
    reasons: result.reasons,
    verified_at: verifiedAt,
    head_commit: verifiedCommit,
    human_corrections: corrections,
    human_minutes: minutes,
    ...fields,
  };
  const updated = await updateRunFile(root, (fresh) => {
    if (
      fresh.task.id !== run.task.id ||
      fresh.baseline.commit !== run.baseline.commit
    ) {
      throw new Error("run.json changed during verify; re-run bench verify");
    }
    return appendVerification({ ...fresh, ...fields }, entry);
  });
  agentNote(options, fields, io);
  if (options.json) {
    io.stdout(`${JSON.stringify(updated, null, 2)}\n`);
  } else {
    io.stderr(
      `Saved to ${RUN_FILE} (${describeAgent(fields)}, corrections: ${corrections}, minutes: ${minutes}). Nothing was sent anywhere.\n`,
    );
    io.stderr(
      pc.dim(
        "Next: omot report to share it anonymously, or omot bench clean to remove the run file.\n",
      ),
    );
  }
  return result.outcome === "fail" ? 1 : 0;
}

export function addBenchCommand(
  program: Command,
  io: BenchIO,
  setExitCode: (code: number) => void,
): void {
  const bench = program
    .command("bench")
    .description("Run standardized benchmark tasks with any AI coding agent")
    .addHelpText(
      "after",
      "\nVerifiers run the repository's own scripts (build, test, lint, typecheck) locally.\nResults stay in .omot/run.json; nothing is sent anywhere.\n",
    );

  bench
    .command("list")
    .description("List benchmark tasks")
    .option("--json", "Print tasks as JSON")
    .action((options: { json?: boolean }) => {
      setExitCode(listTasks(options.json, io));
    });

  bench
    .command("show <id>")
    .description("Show a task and its prompt")
    .option("--param <key=value>", "Fill in a prompt parameter", collect, [])
    .option("--json", "Print the task as JSON")
    .action((id: string, options: ShowOptions) => {
      setExitCode(showTask(id, options, io));
    });

  bench
    .command("start <id> [path]")
    .description("Record a baseline in .omot/run.json and print the prompt")
    .option("--param <key=value>", "Task parameter (repeatable)", collect, [])
    .option(
      "--agent <name>",
      "Coding agent you are benchmarking (stored as a slug)",
    )
    .option("--agent-version <version>", "Version of the coding agent")
    .option("--model <name>", "Model the coding agent used (stored as a slug)")
    .option(
      "--skip-baseline-scripts",
      "Skip task scripts at start (baseline health will be unknown)",
    )
    .option("--branch <name>", "Create and switch to a branch for this run")
    .option(
      "-y, --yes",
      "Confirm .gitignore and fix-failing-test changes without prompting",
    )
    .action(
      async (id: string, target: string | undefined, options: StartOptions) => {
        try {
          setExitCode(await startTask(id, target, options, io));
        } catch (error) {
          if (error instanceof TaskPreconditionError) {
            io.stderr(`Cannot start ${id}: ${error.message}\n`);
            for (const hint of await preconditionScriptHint(
              io.cwd,
              target,
              requireTask(id),
            )) {
              io.stderr(`${hint}\n`);
            }
            setExitCode(1);
            return;
          }
          throw error;
        }
      },
    );

  bench
    .command("verify [path]")
    .description("Run the verifier and record the result in .omot/run.json")
    .option("--corrections <n>", "Times you corrected or redirected the agent")
    .option("--minutes <n>", "Minutes of human effort")
    .option("--agent <name>", "Override the agent recorded at start")
    .option(
      "--agent-version <version>",
      "Override the agent version recorded at start",
    )
    .option("--model <name>", "Override the model recorded at start")
    .option("--json", "Print the updated run as JSON")
    .action(async (target: string | undefined, options: VerifyOptions) => {
      setExitCode(await verifyRun(target, options, io));
    });

  bench
    .command("clean [path]")
    .description("Remove the local benchmark run file")
    .option("--delete-branch", "Delete a branch created by omot for this run")
    .option("-y, --yes", "Confirm cleanup without prompting")
    .action(async (target: string | undefined, options: CleanOptions) => {
      setExitCode(await cleanRun(target, options, io));
    });
}
