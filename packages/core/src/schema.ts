import { z } from "zod";
import type { Check, CheckResult, FixPlan } from "./types";

const categories = ["setup", "verification", "docs", "hygiene"] as const;
const functionSchema = z.custom<(...args: never[]) => unknown>(
  (value) => typeof value === "function",
  { message: "must be a function" },
);

export const checkSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  category: z.enum(categories),
  weight: z.number().int().min(1).max(5),
  why: z.string().min(1),
  run: functionSchema,
  fix: functionSchema.optional(),
});

export const checkResultSchema = z.object({
  status: z.enum(["pass", "fail", "warn", "na"]),
  detail: z.string().optional(),
  fix: z.string().optional(),
});

export const fixPlanSchema = z.array(
  z.object({
    path: z.string().min(1),
    contents: z.string(),
  }),
);

export class InvalidCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCheckError";
  }
}

export function validateCheck(value: unknown, source: string): Check {
  const result = checkSchema.safeParse(value);
  if (result.success) return value as Check;

  const record =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : undefined;
  const id = typeof record?.id === "string" ? record.id : "index";
  const issues = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "check";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
  throw new InvalidCheckError(
    `Invalid check "${id}" from ${source}: ${issues}`,
  );
}

export function validateCheckResult(value: unknown): CheckResult {
  return checkResultSchema.parse(value) as CheckResult;
}

export function validateFixPlan(value: unknown): FixPlan {
  return fixPlanSchema.parse(value) as FixPlan;
}
