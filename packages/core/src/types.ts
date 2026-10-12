export type CheckStatus = "pass" | "fail" | "warn" | "na";

export interface CheckResult {
  status: CheckStatus;
  detail?: string;
  fix?: string;
}

export interface CheckContext {
  root: string;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string | null>;
  glob(pattern: string): Promise<string[]>;
  packageJson: Record<string, unknown> | null;
  run(cmd: string, opts?: { timeoutMs?: number }): Promise<{ code: number }>;
}

export interface Check {
  id: string;
  title: string;
  category: "setup" | "verification" | "docs" | "hygiene";
  weight: number;
  why: string;
  run(ctx: CheckContext): Promise<CheckResult>;
  fix?(ctx: CheckContext): Promise<FixPlan>;
}

export interface FixFile {
  path: string;
  contents: string;
}

export type FixPlan = FixFile[];
export type CheckCategory = Check["category"];
export type Grade = "A" | "B" | "C" | "D";

export const SCORING_VERSION = 1 as const;

export interface ScoreSummary {
  scoring_version: typeof SCORING_VERSION;
  score: number;
  grade: Grade;
  earned: number;
  possible: number;
}

export function defineCheck(check: Check): Check {
  return check;
}
