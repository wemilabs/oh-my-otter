import { z } from "zod";
import {
  biomeRule,
  countBiomeSuppressions,
  isBiomeConfig,
  runBiome,
} from "../../lib/biome";
import { countDisables, isEslintConfig, runEslint } from "../../lib/eslint";
import { summarizeList } from "../../lib/files";
import {
  changedScripts,
  checkScript,
  missingScript,
  scriptChangeReason,
} from "../../lib/scripts";
import { defineTask } from "../../task";
import { TaskPreconditionError } from "../../types";
import manifest from "./task.json";
import prompt from "./prompt.md";

const dataSchema = z.object({
  violations: z.number().int().min(0),
  fatal: z.number().int().nonnegative().default(0),
  fatalFiles: z.array(z.string()).default([]),
});
type Data = z.infer<typeof dataSchema>;

export default defineTask<Data>({
  manifest,
  prompt,
  scripts: ["test"],
  async prepare(ctx) {
    const requestedRule = ctx.params.rule as string;
    const biome = biomeRule(requestedRule);
    const rule = biome ?? requestedRule;
    if (!ctx.hasScript("test")) {
      throw new TaskPreconditionError(missingScript("test"));
    }
    let run;
    try {
      run = biome
        ? await runBiome(ctx, biome)
        : await runEslint(ctx, requestedRule);
    } catch (error) {
      throw new TaskPreconditionError((error as Error).message);
    }
    if (run.count === 0) {
      throw new TaskPreconditionError(
        biome
          ? `Biome reports no violations of ${rule}; pick a rule that is enabled and violated.`
          : `ESLint reports no violations of ${rule}; pick a rule that is enabled and violated.`,
      );
    }
    ctx.log(`Baseline: ${run.count} violation(s) of ${rule}.`);
    return {
      violations: run.count,
      fatal: run.fatal,
      fatalFiles: run.fatalFiles,
    };
  },
  async verify(ctx) {
    const {
      violations: before,
      fatal: baselineFatal,
      fatalFiles: baselineFatalFiles,
    } = dataSchema.parse(ctx.baseline.data);
    const reasons: string[] = [];
    const biome = biomeRule(ctx.params.rule as string);
    const rule = biome ?? (ctx.params.rule as string);
    let run;
    try {
      run = biome ? await runBiome(ctx, biome) : await runEslint(ctx, rule);
    } catch (error) {
      return { outcome: "fail", reasons: [(error as Error).message] };
    }
    reasons.push(`${rule} violations: ${before} → ${run.count}.`);
    if (run.count > 0) {
      reasons.push(`Remaining in: ${summarizeList(run.files)}.`);
    }
    let partial = false;
    const baselineFatalFileSet = new Set(baselineFatalFiles);
    const newFatal = run.fatalFiles.filter(
      (file) => !baselineFatalFileSet.has(file),
    );
    const linter = biome ? "Biome" : "ESLint";
    if (newFatal.length > 0) {
      partial = true;
      reasons.push(
        `${linter} reported new parse or internal errors in ${summarizeList(newFatal)}; violations of ${rule} there are not counted.`,
      );
    } else if (run.fatal > baselineFatal) {
      const increase = run.fatal - baselineFatal;
      partial = true;
      reasons.push(
        `${linter} reported ${increase} new parse or internal error(s); violations of ${rule} in those files are not counted.`,
      );
    }
    if (run.count >= before) return { outcome: "fail", reasons };

    partial ||= run.count > 0;
    const changed = await ctx.changedFiles();
    const configs = changed.filter((file) =>
      biome ? isBiomeConfig(file.path) : isEslintConfig(file.path),
    );
    if (configs.length > 0) {
      partial = true;
      reasons.push(
        biome
          ? `Biome configuration changed: ${summarizeList(configs.map((file) => file.path))}.`
          : `ESLint configuration changed: ${summarizeList(configs.map((file) => file.path))}.`,
      );
    }
    let added = 0;
    for (const file of changed) {
      if (file.status === "deleted") continue;
      const after = (await ctx.read(file.path)) ?? "";
      const previous =
        file.status === "added"
          ? ""
          : ((await ctx.readBaseline(file.path)) ?? "");
      added += Math.max(
        0,
        (biome
          ? countBiomeSuppressions(after, biome)
          : countDisables(after, rule)) -
          (biome
            ? countBiomeSuppressions(previous, biome)
            : countDisables(previous, rule)),
      );
    }
    if (added > 0) {
      partial = true;
      reasons.push(
        biome
          ? `${added} new biome-ignore comment(s) cover ${rule}.`
          : `${added} new eslint-disable comment(s) cover ${rule}.`,
      );
    }

    const scripts = await changedScripts(ctx, ["test"]);
    if (scripts.length > 0) {
      partial = true;
      reasons.push(scriptChangeReason(scripts));
    }
    const test = await checkScript(ctx, "test");
    if (test.result === null || test.counted) partial = true;
    reasons.push(test.result === null ? "No test script." : test.reason);
    return { outcome: partial ? "partial" : "pass", reasons };
  },
});
