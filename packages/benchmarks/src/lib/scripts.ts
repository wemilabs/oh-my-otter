import { commandFailure } from "../context";
import type { CommandResult, VerifyContext } from "../types";

function scriptsOf(text: string | null): Record<string, unknown> {
  if (text === null) return {};
  try {
    const scripts = (JSON.parse(text) as { scripts?: unknown }).scripts;
    return scripts && typeof scripts === "object"
      ? (scripts as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Names of root package.json scripts whose command differs from the baseline. */
export async function changedScripts(
  ctx: VerifyContext,
  names: readonly string[],
): Promise<string[]> {
  const before = scriptsOf(await ctx.readBaseline("package.json"));
  const after = scriptsOf(await ctx.read("package.json"));
  return names.filter((name) => before[name] !== after[name]);
}

export function scriptChangeReason(names: readonly string[]): string {
  return `package.json scripts changed since the baseline: ${names.join(", ")}.`;
}

const OUTPUT_TAIL_LINES = 15;
const MAX_LINE_LENGTH = 240;
const ansiPattern = new RegExp(String.raw`\u001b\[[0-9;?]*[A-Za-z]`, "g");
const secretValue = String.raw`("[^"]*"|'[^']*'|[^\s"',;]+)`;
const uppercaseSecretPattern = new RegExp(
  String.raw`\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIALS?)[A-Z0-9_]*)(\s*[=:]\s*)${secretValue}`,
  "g",
);
const lowercaseSecretPattern = new RegExp(
  String.raw`\b(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)(\s*[=:]\s*)${secretValue}`,
  "gi",
);
const privateKeyBeginPattern = /-----BEGIN ([A-Z ]*PRIVATE KEY)-----/;
const privateKeyEndPattern = /-----END ([A-Z ]*PRIVATE KEY)-----/;

export function redactSecrets(line: string): string {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) {
    return "[redacted private key]";
  }
  return line
    .replace(uppercaseSecretPattern, "$1$2[redacted]")
    .replace(lowercaseSecretPattern, "$1$2[redacted]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 [redacted]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/g, "$1[redacted]@")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted]")
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, "[redacted]")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/xox[abprs]-[A-Za-z0-9-]{10,}/g, "[redacted]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[redacted]")
    .replace(/npm_[A-Za-z0-9]{30,}/g, "[redacted]")
    .replace(
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
      "[redacted]",
    );
}

function redactPrivateKeyBlocks(lines: string[]): string[] {
  const redacted: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const begin = privateKeyBeginPattern.exec(lines[index] ?? "");
    if (!begin) {
      redacted.push(lines[index] ?? "");
      continue;
    }
    redacted.push("[redacted private key]");
    const keyType = begin[1];
    while (++index < lines.length) {
      const end = privateKeyEndPattern.exec(lines[index] ?? "");
      if (end?.[1] === keyType) break;
    }
  }
  return redacted;
}

/** The last non-empty lines of a command's combined output, trimmed. */
export function outputTail(
  result: CommandResult,
  lines = OUTPUT_TAIL_LINES,
): string[] {
  const outputLines = result.output
    .replace(ansiPattern, "")
    .split(/\r?\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line.trim().length > 0);
  return redactPrivateKeyBlocks(outputLines)
    .map(redactSecrets)
    .slice(-lines)
    .map((line) =>
      line.length > MAX_LINE_LENGTH
        ? `${line.slice(0, MAX_LINE_LENGTH - 1)}…`
        : line,
    );
}

/** `headline`, then the output tail as indented lines (when there is output). */
export function withOutput(headline: string, result: CommandResult): string {
  const tail = outputTail(result);
  if (tail.length === 0) return headline;
  return [`${headline} Last output:`, ...tail.map((line) => `  ${line}`)].join(
    "\n",
  );
}

export interface ScriptCheck {
  /** null when the script does not exist. */
  result: CommandResult | null;
  /** True when a failure counts against the agent. */
  counted: boolean;
  reason: string;
}

/**
 * Runs a script and explains the result against the baseline. A failure that
 * also failed at the baseline is not counted. `target` scripts (the task's own
 * measurement) always count.
 */
export async function checkScript(
  ctx: VerifyContext,
  name: string,
  options: { label?: string; target?: boolean } = {},
): Promise<ScriptCheck> {
  const label = options.label ?? `${name} script`;
  const result = await ctx.runScript(name);
  if (result === null) {
    return { result, counted: false, reason: `No ${name} script; skipped.` };
  }
  if (result.code === 0 && !result.timedOut) {
    return { result, counted: false, reason: `${label} passed.` };
  }
  const failure = commandFailure(label, result);
  const baseline = ctx.baseline.scripts;
  const before = baseline?.[name];
  if (!options.target && before !== undefined && before !== 0) {
    return {
      result,
      counted: false,
      reason: withOutput(
        `${label} failed at baseline too (likely environment or preexisting); not counted.`,
        result,
      ),
    };
  }
  const note =
    options.target || before === 0
      ? ""
      : baseline === undefined
        ? " Baseline health is unknown (baseline scripts were not recorded)."
        : ` Baseline health is unknown (no ${name} script at the baseline).`;
  return {
    result,
    counted: true,
    reason: withOutput(`${failure}${note}`, result),
  };
}

const missingScriptHints: Record<string, string> = {
  test: 'Add a test script (for example "test": "node --test" or "vitest run")',
  build: "Add a build script",
  typecheck: 'Add a typecheck script (for example "typecheck": "tsc --noEmit")',
  lint: "Add a lint script",
};

/** Precondition message for a missing package.json script. */
export function missingScript(name: string): string {
  const hint = missingScriptHints[name] ?? `Add a ${name} script`;
  return `Precondition not met: no ${name} script (scripts.${name}) in package.json. ${hint}; \`omot scan --fix\` can generate CI and other missing pieces.`;
}
