import { z } from "zod";
import { commandFailure } from "../../context";
import { countDisables, isEslintConfig, runEslint } from "../../lib/eslint";
import { summarizeList } from "../../lib/files";
import { changedScripts, scriptChangeReason } from "../../lib/scripts";
import { defineTask } from "../../task";
import { TaskPreconditionError } from "../../types";
import manifest from "./task.json";
import prompt from "./prompt.md";

const dataSchema = z.object({ violations: z.number().int().min(0) });
type Data = z.infer<typeof dataSchema>;

export default defineTask<Data>({
  manifest,
  prompt,
  async prepare(ctx) {
    const rule = ctx.params.rule as string;
    if (!ctx.hasScript("test")) {
      throw new TaskPreconditionError("No test script (scripts.test) found.");
    }
    let run;
    try {
      run = await runEslint(ctx, rule);
    } catch (error) {
      throw new TaskPreconditionError((error as Error).message);
    }
    if (run.count === 0) {
      throw new TaskPreconditionError(
        `ESLint reports no violations of ${rule}; pick a rule that is enabled and violated.`,
      );
    }
    ctx.log(`Baseline: ${run.count} violation(s) of ${rule}.`);
    return { violations: run.count };
  },
  async verify(ctx) {
    const rule = ctx.params.rule as string;
    const { violations: before } = dataSchema.parse(ctx.baseline.data);
    const reasons: string[] = [];
    let run;
    try {
      run = await runEslint(ctx, rule);
    } catch (error) {
      return { outcome: "fail", reasons: [(error as Error).message] };
    }
    reasons.push(`${rule} violations: ${before} → ${run.count}.`);
    if (run.count > 0) {
      reasons.push(`Remaining in: ${summarizeList(run.files)}.`);
    }
    if (run.count >= before) return { outcome: "fail", reasons };

    let partial = run.count > 0;
    const changed = await ctx.changedFiles();
    const configs = changed.filter((file) => isEslintConfig(file.path));
    if (configs.length > 0) {
      partial = true;
      reasons.push(
        `ESLint configuration changed: ${summarizeList(configs.map((file) => file.path))}.`,
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
        countDisables(after, rule) - countDisables(previous, rule),
      );
    }
    if (added > 0) {
      partial = true;
      reasons.push(`${added} new eslint-disable comment(s) cover ${rule}.`);
    }

    const scripts = await changedScripts(ctx, ["test"]);
    if (scripts.length > 0) {
      partial = true;
      reasons.push(scriptChangeReason(scripts));
    }
    const result = await ctx.runScript("test");
    if (result === null || result.code !== 0) {
      partial = true;
      reasons.push(
        result === null
          ? "No test script."
          : commandFailure("test script", result),
      );
    } else {
      reasons.push("test script passed.");
    }
    return { outcome: partial ? "partial" : "pass", reasons };
  },
});
