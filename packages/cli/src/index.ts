import type { Check } from "@oh-my-otter/core";

export { defineCheck } from "@oh-my-otter/core";
export type {
  Check,
  CheckCategory,
  CheckContext,
  CheckResult,
  CheckStatus,
  FixFile,
  FixPlan,
  Grade,
  ScoreSummary,
} from "@oh-my-otter/core";

export interface OmotConfig {
  plugins?: Array<string | Check | Check[]>;
}

export function defineConfig(config: OmotConfig): OmotConfig {
  return config;
}
