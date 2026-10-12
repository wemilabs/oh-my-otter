import { z } from "zod";
import { builtinChecks } from "@oh-my-otter/checks";

export const BUILTIN_CHECK_IDS = builtinChecks.map((check) => check.id) as [
  string,
  ...string[],
];

export const checkStatusSchema = z.enum(["pass", "fail", "warn", "na"]);

export const stackSchema = z
  .object({
    package_manager: z.enum(["npm", "pnpm", "yarn", "bun", "other"]),
    language: z.enum(["typescript", "javascript"]),
    framework: z.enum([
      "nextjs",
      "react",
      "vue",
      "svelte",
      "astro",
      "node",
      "other",
    ]),
  })
  .strict();

export const scanSummarySchema = z
  .object({
    scoring_version: z.number().int().min(1),
    readiness_score: z.number().int().min(0).max(100),
    checks: z.partialRecord(z.enum(BUILTIN_CHECK_IDS), checkStatusSchema),
    stack: stackSchema,
  })
  .strict();

export type CheckStatusValue = z.infer<typeof checkStatusSchema>;
export type Stack = z.infer<typeof stackSchema>;
export type ScanSummary = z.infer<typeof scanSummarySchema>;
