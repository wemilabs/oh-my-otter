import { z } from "zod";

export const TASK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const paramKinds = ["package", "path", "identifier", "rule"] as const;
export type ParamKind = (typeof paramKinds)[number];

const paramValuePatterns: Record<ParamKind, RegExp> = {
  package: /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/,
  path: /^[A-Za-z0-9._@()[\]+-][A-Za-z0-9._@()[\]+\- /]*$/,
  identifier: /^[A-Za-z_$][A-Za-z0-9_$]*$/,
  rule: /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._/-]*$/,
};

const paramKindDescriptions: Record<ParamKind, string> = {
  package: "an npm package name",
  path: "a repository-relative path",
  identifier: "a JavaScript identifier",
  rule: "an ESLint rule id",
};

export const taskParamSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9-]*$/),
    kind: z.enum(paramKinds),
    description: z.string().min(1),
    example: z.string().min(1),
  })
  .strict();

export const taskManifestSchema = z
  .object({
    id: z.string().regex(TASK_ID_PATTERN),
    version: z.number().int().min(1),
    title: z.string().min(1),
    category: z.enum([
      "dependencies",
      "testing",
      "lint",
      "accessibility",
      "types",
    ]),
    estimatedScope: z.enum(["small", "medium"]),
    params: z.array(taskParamSchema),
    preconditions: z.array(z.string().min(1)).min(1),
    criteria: z
      .object({
        pass: z.string().min(1),
        partial: z.string().min(1),
        fail: z.string().min(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const names = manifest.params.map((param) => param.name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate param names." });
    }
  });

export type TaskManifest = z.infer<typeof taskManifestSchema>;
export type TaskParam = z.infer<typeof taskParamSchema>;

export const verifyOutcomeSchema = z.enum(["pass", "partial", "fail"]);
export type VerifyOutcome = z.infer<typeof verifyOutcomeSchema>;

export const verifyResultSchema = z
  .object({
    outcome: verifyOutcomeSchema,
    reasons: z.array(z.string()),
  })
  .strict();
export type VerifyResult = z.infer<typeof verifyResultSchema>;

export const AGENT_PATTERN = /^[a-z0-9._-]{1,40}$/;
export const DEFAULT_AGENT = "unknown";

export const AGENT_VERSION_PATTERN = /^[a-z0-9._-]{1,40}$/;
export const MODEL_PATTERN = /^[a-z0-9._-]{1,60}$/;

function slugify(value: string, max: number): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, max)
    .replace(/[-.]+$/g, "");
}

export function normalizeAgent(value: string | undefined): string {
  if (value === undefined) return DEFAULT_AGENT;
  const slug = slugify(value, 40);
  return slug.length > 0 ? slug : DEFAULT_AGENT;
}

/** Normalizes `--agent-version`; returns undefined when nothing usable is left. */
export function normalizeAgentVersion(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  return slugify(value, 40) || undefined;
}

/** Normalizes `--model`; returns undefined when nothing usable is left. */
export function normalizeModel(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return slugify(value, 60) || undefined;
}

export const agentSchema = z.string().regex(AGENT_PATTERN);

const commitSchema = z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/);
const timestampSchema = z.iso.datetime();

export const RUN_SCHEMA_VERSION = 1 as const;

export const runFileSchema = z
  .object({
    schema_version: z.literal(RUN_SCHEMA_VERSION),
    task: z
      .object({
        id: z.string().regex(TASK_ID_PATTERN),
        version: z.number().int().min(1),
      })
      .strict(),
    params: z.record(z.string(), z.string()),
    agent: agentSchema.default(DEFAULT_AGENT),
    agent_version: z.string().regex(AGENT_VERSION_PATTERN).optional(),
    model: z.string().regex(MODEL_PATTERN).optional(),
    baseline: z
      .object({
        commit: commitSchema,
        started_at: timestampSchema,
        data: z.unknown().optional(),
      })
      .strict(),
    result: z
      .object({
        outcome: verifyOutcomeSchema,
        reasons: z.array(z.string()),
        verified_at: timestampSchema,
        human_corrections: z.number().int().min(0),
        human_minutes: z.number().int().min(0),
      })
      .strict()
      .optional(),
  })
  .strict();

export type RunFile = z.infer<typeof runFileSchema>;

export const selfReportSchema = z.coerce.number().int().min(0).max(100_000);

export function parseParams(
  manifest: TaskManifest,
  values: readonly string[],
): Record<string, string> {
  const params: Record<string, string> = {};
  const known = new Map(manifest.params.map((param) => [param.name, param]));
  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator <= 0) {
      throw new Error(`Invalid --param "${value}": expected key=value.`);
    }
    const name = value.slice(0, separator).trim();
    const paramValue = value.slice(separator + 1).trim();
    const param = known.get(name);
    if (!param) {
      const names = manifest.params.map((entry) => entry.name).join(", ");
      throw new Error(
        `Unknown param "${name}" for ${manifest.id}; expected: ${names || "none"}.`,
      );
    }
    if (name in params) throw new Error(`Duplicate param "${name}".`);
    if (!validParamValue(param.kind, paramValue)) {
      throw new Error(
        `Invalid value for param "${name}": expected ${paramKindDescriptions[param.kind]}, got "${paramValue}".`,
      );
    }
    params[name] =
      param.kind === "path" ? normalizeParamPath(paramValue) : paramValue;
  }
  const missing = manifest.params
    .filter((param) => !(param.name in params))
    .map((param) => `--param ${param.name}=<${param.kind}>`);
  if (missing.length > 0) {
    throw new Error(`Missing required param(s): ${missing.join(", ")}.`);
  }
  return params;
}

function normalizeParamPath(value: string): string {
  return (
    value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "") || "."
  );
}

export function validParamValue(kind: ParamKind, value: string): boolean {
  if (value.length === 0 || value.length > 200) return false;
  if (kind === "path") {
    const normalized = value.replace(/\\/g, "/");
    if (
      normalized.startsWith("/") ||
      /^[A-Za-z]:/.test(normalized) ||
      normalized.split("/").includes("..")
    ) {
      return false;
    }
    return paramValuePatterns.path.test(normalized);
  }
  return paramValuePatterns[kind].test(value);
}

export function renderPrompt(
  template: string,
  params: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([a-z][a-z0-9-]*)\s*\}\}/g, (match, name) =>
    Object.hasOwn(params, name) ? (params[name] as string) : match,
  );
}
