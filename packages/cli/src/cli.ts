import { access, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { Command, CommanderError, Option } from "commander";
import { createJiti } from "jiti";
import pc from "picocolors";
import { z } from "zod";
import {
  collectFixPlans,
  runChecks,
  validateCheck,
  type Check,
  type CheckCategory,
  type CheckContext,
  type CheckOutcome,
  type FixPlan,
  type Grade,
  type ScanReport,
} from "@oh-my-otter/core";
import {
  applyFixPlan,
  createCheckContext,
  planFixes,
} from "@oh-my-otter/core/node";
import { builtinChecks } from "@oh-my-otter/checks";

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  isTTY: boolean;
  confirm: (question: string) => Promise<boolean>;
}

interface ScanOptions {
  run?: boolean;
  json?: boolean;
  fix?: boolean;
  yes?: boolean;
  badge?: boolean;
  plugin?: string[];
  minScore?: string;
}

interface ChecksOptions {
  plugin?: string[];
  json?: boolean;
}

interface LoadedChecks {
  checks: Check[];
  sources: Map<string, string>;
}

const require = createRequire(import.meta.url);
const packageMetadata = require("../package.json") as { version: string };
const configFiles = [
  "omot.config.ts",
  "omot.config.mts",
  "omot.config.js",
  "omot.config.mjs",
];
const configSchema = z
  .object({
    plugins: z
      .array(
        z.union([
          z.string(),
          z.array(z.unknown()),
          z.record(z.string(), z.unknown()),
        ]),
      )
      .optional(),
  })
  .strict();
const minScoreSchema = z.coerce.number().int().min(0).max(100);
function defaultConfirm(question: string): Promise<boolean> {
  const readline = createInterface({ input: stdin, output: stdout });
  return readline
    .question(`${question} [y/N] `)
    .then((answer) => /^y(?:es)?$/i.test(answer.trim()))
    .finally(() => readline.close());
}

function getIO(io: Partial<CliIO> = {}): CliIO {
  return {
    stdout: io.stdout ?? ((text) => stdout.write(text)),
    stderr: io.stderr ?? ((text) => stderr.write(text)),
    cwd: path.resolve(io.cwd ?? process.cwd()),
    isTTY: io.isTTY ?? Boolean(process.stdout.isTTY),
    confirm: io.confirm ?? defaultConfirm,
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPathLike(specifier: string): boolean {
  return (
    specifier.startsWith(".") ||
    path.isAbsolute(specifier) ||
    /^[A-Za-z]:[\\/]/.test(specifier)
  );
}

async function existsOnDisk(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function resolvePackage(specifier: string, roots: string[]): string {
  const errors: string[] = [];
  for (const root of roots) {
    try {
      return createJiti(
        pathToFileURL(path.join(root, "package.json")).href,
      ).esmResolve(specifier);
    } catch (error) {
      errors.push(errorText(error));
    }
    try {
      return createRequire(path.join(root, "package.json")).resolve(specifier);
    } catch (error) {
      errors.push(errorText(error));
    }
  }
  throw new Error(
    `Cannot resolve package plugin "${specifier}": ${errors.at(-1) ?? "module not found"}`,
  );
}

function resolveConfigPlugin(
  specifier: string,
  root: string,
  configPath: string,
): string {
  if (isPathLike(specifier)) {
    return path.resolve(path.dirname(configPath), specifier);
  }
  return resolvePackage(specifier, [root]);
}

async function resolveCliPlugin(
  specifier: string,
  root: string,
  cwd: string,
): Promise<string> {
  const absoluteFromCwd = path.resolve(cwd, specifier);
  if (
    isPathLike(specifier) ||
    (await existsOnDisk(absoluteFromCwd)) ||
    /^[A-Za-z]:[\\/]/.test(specifier)
  ) {
    return absoluteFromCwd;
  }
  return resolvePackage(specifier, [root, cwd]);
}

function configIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
    .join("; ");
}

async function importDefault(file: string): Promise<unknown> {
  const jiti = createJiti(import.meta.url);
  return jiti.import(file, { default: true });
}

function addPluginChecks(
  checks: Check[],
  sources: Map<string, string>,
  seen: Map<string, string>,
  values: unknown[],
  source: string,
): void {
  for (const [index, value] of values.entries()) {
    let check: Check;
    try {
      check = validateCheck(value, `${source} (index ${index})`);
    } catch (error) {
      throw new Error(errorText(error), { cause: error });
    }
    const previousSource = seen.get(check.id);
    if (previousSource) {
      throw new Error(
        `Duplicate check id "${check.id}" from ${source}; already registered from ${previousSource}.`,
      );
    }
    seen.set(check.id, source);
    sources.set(check.id, source);
    checks.push(check);
  }
}

async function loadChecks(
  root: string,
  cwd: string,
  cliPlugins: string[] = [],
): Promise<LoadedChecks> {
  const checks = [...builtinChecks];
  const sources = new Map<string, string>();
  const seen = new Map<string, string>();
  for (const check of builtinChecks) {
    seen.set(check.id, "builtin");
    sources.set(check.id, "builtin");
  }
  const configContext = createCheckContext(root);
  let configPath: string | undefined;
  for (const file of configFiles) {
    if (await configContext.exists(file)) {
      configPath = path.join(root, file);
      break;
    }
  }

  if (configPath) {
    let configValue: unknown;
    try {
      configValue = await importDefault(configPath);
    } catch (error) {
      throw new Error(
        `Failed to load config "${configPath}": ${errorText(error)}`,
        { cause: error },
      );
    }
    const parsed = configSchema.safeParse(configValue);
    if (!parsed.success) {
      throw new Error(
        `Invalid config "${configPath}": ${configIssues(parsed.error)}`,
      );
    }

    for (const plugin of parsed.data.plugins ?? []) {
      if (typeof plugin === "string") {
        const file = resolveConfigPlugin(plugin, root, configPath);
        let value: unknown;
        try {
          value = await importDefault(file);
        } catch (error) {
          throw new Error(
            `Failed to load plugin "${plugin}" from ${configPath}: ${errorText(error)}`,
            { cause: error },
          );
        }
        if (!Array.isArray(value)) {
          throw new Error(
            `Plugin "${plugin}" from ${configPath} must default-export an array of checks.`,
          );
        }
        addPluginChecks(checks, sources, seen, value, file);
      } else {
        const values = Array.isArray(plugin) ? plugin : [plugin];
        addPluginChecks(checks, sources, seen, values, configPath);
      }
    }
  }

  for (const specifier of cliPlugins) {
    let file: string;
    try {
      file = await resolveCliPlugin(specifier, root, cwd);
    } catch (error) {
      throw new Error(
        `Failed to resolve plugin "${specifier}": ${errorText(error)}`,
        { cause: error },
      );
    }
    let value: unknown;
    try {
      value = await importDefault(file);
    } catch (error) {
      throw new Error(
        `Failed to load plugin "${specifier}" (${file}): ${errorText(error)}`,
        { cause: error },
      );
    }
    if (!Array.isArray(value)) {
      throw new Error(
        `Plugin "${specifier}" (${file}) must default-export an array of checks.`,
      );
    }
    addPluginChecks(checks, sources, seen, value, file);
  }

  return { checks, sources };
}

async function resolveRoot(
  target: string | undefined,
  cwd: string,
): Promise<string> {
  const root = path.resolve(cwd, target ?? ".");
  let info;
  try {
    info = await stat(root);
  } catch {
    throw new Error(`Path does not exist: ${root}`);
  }
  if (!info.isDirectory()) throw new Error(`Path is not a directory: ${root}`);
  return root;
}

function badgeColor(grade: Grade): string {
  return { A: "brightgreen", B: "green", C: "yellow", D: "red" }[grade];
}

export function badgeMarkdown(score: number, grade: Grade): string {
  const label = encodeURIComponent(`${score} · ${grade}`);
  return `![agent-ready](https://img.shields.io/badge/agent--ready-${label}-${badgeColor(grade)})`;
}

function jsonReport(
  report: ScanReport,
  badge?: string,
  fixes?: unknown,
): string {
  return (
    JSON.stringify(
      {
        scoring_version: report.score.scoring_version,
        score: report.score.score,
        grade: report.score.grade,
        checks: report.outcomes.map(({ check, result }) => ({
          id: check.id,
          title: check.title,
          category: check.category,
          weight: check.weight,
          status: result.status,
          ...(result.detail ? { detail: result.detail } : {}),
          ...(result.fix ? { fix: result.fix } : {}),
        })),
        ...(badge ? { badge } : {}),
        ...(fixes !== undefined ? { fixes } : {}),
      },
      null,
      2,
    ) + "\n"
  );
}

function humanReport(root: string, report: ScanReport): string {
  const lines = [`Oh My Otter · ${root}`, ""];
  const groups = new Map<CheckCategory, CheckOutcome[]>();
  for (const outcome of report.outcomes) {
    const values = groups.get(outcome.check.category) ?? [];
    values.push(outcome);
    groups.set(outcome.check.category, values);
  }
  const icon = {
    pass: pc.green("✓"),
    fail: pc.red("✗"),
    warn: pc.yellow("!"),
    na: pc.dim("–"),
  };
  for (const category of [
    "setup",
    "verification",
    "docs",
    "hygiene",
  ] as const) {
    const outcomes = groups.get(category);
    if (!outcomes?.length) continue;
    lines.push(pc.bold(category));
    for (const { check, result } of outcomes) {
      const detail = result.detail ? ` · ${result.detail}` : "";
      lines.push(
        `  ${icon[result.status]} ${check.id} · ${check.title} (weight ${check.weight})${detail}`,
      );
      if (
        (result.status === "fail" || result.status === "warn") &&
        result.fix
      ) {
        lines.push(`    Fix: ${result.fix}`);
      }
    }
    lines.push("");
  }
  lines.push(
    `Score: ${report.score.score} · ${report.score.grade} (scoring v${report.score.scoring_version})`,
  );
  if (
    report.outcomes.some(
      ({ check, result }) =>
        check.id === "tests-pass" &&
        result.status === "na" &&
        result.detail?.includes("pass --run"),
    )
  ) {
    lines.push("Hint: pass --run to execute the repository's test script.");
  }
  if (
    report.outcomes.some(
      ({ check, result }) =>
        (result.status === "fail" || result.status === "warn") &&
        Boolean(check.fix),
    )
  ) {
    lines.push("Hint: use --fix to preview create-only fixes.");
  }
  return `${lines.join("\n")}\n`;
}

function diffPreview(filePath: string, contents: string): string {
  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const preview = [
    "--- /dev/null",
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => pc.green(`+${line}`)),
  ];
  return `${preview.join("\n")}\n`;
}

async function fixReport(
  root: string,
  report: ScanReport,
  ctx: CheckContext,
  io: CliIO,
  jsonMode: boolean,
  yes: boolean,
): Promise<{
  planned: string[];
  created: string[];
  skipped: string[];
  applied: boolean;
}> {
  const plans = await collectFixPlans(report.outcomes, ctx);
  const files: FixPlan = plans.flatMap((plan) => plan.files);
  const paths = files.map((file) => file.path);
  const plan = await planFixes(root, files);
  if (!jsonMode) {
    for (const file of files) {
      if (plan.created.includes(file.path))
        io.stdout(diffPreview(file.path, file.contents));
    }
    if (plan.skipped.length > 0) {
      io.stdout(`Skipped existing file(s): ${plan.skipped.join(", ")}\n`);
    }
  }

  let shouldApply = yes;
  if (!jsonMode && !yes && plan.created.length > 0) {
    if (io.isTTY) {
      shouldApply = await io.confirm(`Create ${plan.created.length} file(s)?`);
    } else {
      io.stdout("Fixes not applied; re-run with --yes to create the files.\n");
    }
  }
  if (jsonMode && !yes && plan.created.length > 0) {
    io.stderr(
      "Fixes not applied in --json mode; re-run with --yes to create them.\n",
    );
  }

  let applied = { created: [] as string[], skipped: [] as string[] };
  if (shouldApply && plan.created.length > 0) {
    applied = await applyFixPlan(root, files);
  }
  const skipped = [...new Set([...plan.skipped, ...applied.skipped])];
  if (!jsonMode && applied.created.length > 0) {
    io.stdout(`Created: ${applied.created.join(", ")}\n`);
  }
  return {
    planned: paths,
    created: applied.created,
    skipped,
    applied: applied.created.length > 0,
  };
}

async function scan(
  target: string | undefined,
  options: ScanOptions,
  io: CliIO,
): Promise<number> {
  const root = await resolveRoot(target, io.cwd);
  let minScore: number | undefined;
  if (options.minScore !== undefined) {
    const parsed = minScoreSchema.safeParse(options.minScore);
    if (!parsed.success) {
      throw new Error(
        `Invalid --min-score "${options.minScore}": expected an integer from 0 to 100.`,
      );
    }
    minScore = parsed.data;
  }

  const loaded = await loadChecks(root, io.cwd, options.plugin ?? []);
  const ctx = createCheckContext(root, { allowRun: Boolean(options.run) });
  const report = await runChecks(loaded.checks, ctx);
  const badge = options.badge
    ? badgeMarkdown(report.score.score, report.score.grade)
    : undefined;

  if (!options.json) {
    io.stdout(humanReport(root, report));
    if (badge) io.stdout(`${badge}\n`);
  }

  let fixes:
    | {
        planned: string[];
        created: string[];
        skipped: string[];
        applied: boolean;
      }
    | undefined;
  if (options.fix) {
    fixes = await fixReport(
      root,
      report,
      ctx,
      io,
      Boolean(options.json),
      Boolean(options.yes),
    );
  }
  if (options.json) {
    io.stdout(jsonReport(report, badge, fixes));
  }

  if (minScore !== undefined && report.score.score < minScore) {
    io.stderr(
      `Score ${report.score.score} is below the required minimum score of ${minScore}.\n`,
    );
    return 1;
  }
  return 0;
}

async function listChecks(
  target: string | undefined,
  options: ChecksOptions,
  io: CliIO,
): Promise<number> {
  const root = await resolveRoot(target, io.cwd);
  const loaded = await loadChecks(root, io.cwd, options.plugin ?? []);
  const checks = loaded.checks.map((check) => ({
    id: check.id,
    title: check.title,
    category: check.category,
    weight: check.weight,
    source: loaded.sources.get(check.id) ?? "builtin",
  }));
  if (options.json) {
    io.stdout(`${JSON.stringify({ checks }, null, 2)}\n`);
  } else {
    io.stdout(
      `${checks
        .map(
          (check) =>
            `${check.id} · ${check.title} (${check.category}, weight ${check.weight}) [${check.source}]`,
        )
        .join("\n")}\n`,
    );
  }
  return 0;
}

function addScanOptions(command: Command): Command {
  return command
    .option("--run", "Execute repository test scripts")
    .option("--json", "Print a machine-readable JSON report")
    .option("--fix", "Preview and optionally apply create-only fixes")
    .option("-y, --yes", "Apply fixes without prompting")
    .option("--badge", "Print a Markdown badge")
    .option(
      "--plugin <specifier>",
      "Load a plugin by file path or package",
      (value: string, previous: string[] = []) => [...previous, value],
      [],
    )
    .addOption(
      new Option("--min-score <n>", "Fail if score is below this threshold"),
    );
}

function normalizeArgv(argv: string[]): string[] {
  if (argv.length === 0) return ["scan"];
  const first = argv[0] ?? "";
  if (
    [
      "scan",
      "init",
      "checks",
      "help",
      "--help",
      "-h",
      "--version",
      "-V",
    ].includes(first)
  ) {
    return argv;
  }
  return ["scan", ...argv];
}

export async function main(
  argv: string[],
  ioOptions: Partial<CliIO> = {},
): Promise<number> {
  const io = getIO(ioOptions);
  let actionExitCode = 0;
  const program = new Command();
  program
    .name("omot")
    .description(
      "Check how ready a repository is for Devin. scan is the default command, so plain omot runs it.",
    )
    .version(packageMetadata.version)
    .addHelpText(
      "after",
      "\nOh My Otter is unofficial and independent. It is not affiliated with or endorsed by Cognition.\nScanning runs locally with no network calls.\n",
    )
    .configureOutput({
      writeOut: (text) => io.stdout(text),
      writeErr: (text) => io.stderr(text),
      outputError: (text, write) => write(text),
    })
    .exitOverride();

  const scanCommand = program.command("scan [path]", { isDefault: true });
  addScanOptions(scanCommand).description(
    "Scan a repository for agent readiness",
  );
  scanCommand.action(
    async (target: string | undefined, options: ScanOptions) => {
      actionExitCode = await scan(target, options, io);
    },
  );

  const initCommand = program.command("init [path]", { hidden: true });
  addScanOptions(initCommand).description("Legacy alias for scan");
  initCommand.action(
    async (target: string | undefined, options: ScanOptions) => {
      actionExitCode = await scan(target, options, io);
    },
  );

  program
    .command("checks [path]")
    .description("List built-in and plugin checks")
    .option(
      "--plugin <specifier>",
      "Load a plugin by file path or package",
      (value: string, previous: string[] = []) => [...previous, value],
      [],
    )
    .option("--json", "Print checks as JSON")
    .action(async (target: string | undefined, options: ChecksOptions) => {
      actionExitCode = await listChecks(target, options, io);
    });

  try {
    await program.parseAsync(normalizeArgv(argv), { from: "user" });
    return actionExitCode;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    io.stderr(`Error: ${errorText(error)}\n`);
    return 1;
  }
}
