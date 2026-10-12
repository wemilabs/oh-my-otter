import { z } from "zod";
import { commandFailure, readText } from "../../context";
import { countExplicitAny, countTypeSuppressions } from "../../lib/lexer";
import { changedScripts, scriptChangeReason } from "../../lib/scripts";
import { defineTask } from "../../task";
import { TaskPreconditionError, type RepoContext } from "../../types";
import manifest from "./task.json";
import prompt from "./prompt.md";

const dataSchema = z.object({
  any: z.number().int().min(0),
  suppressions: z.number().int().min(0),
});
type Data = z.infer<typeof dataSchema>;

const typescriptFile = /\.(?:[cm]?ts|tsx)$/;

async function typecheck(ctx: RepoContext) {
  if (ctx.hasScript("typecheck")) return ctx.runScript("typecheck");
  if (!(await ctx.exists("tsconfig.json"))) return null;
  return ctx.runPackageBin(
    "typescript",
    ["--noEmit", "-p", "tsconfig.json"],
    "tsc",
  );
}

export default defineTask<Data>({
  manifest,
  prompt,
  async prepare(ctx) {
    const file = ctx.params.file as string;
    if (!typescriptFile.test(file) || file.endsWith(".d.ts")) {
      throw new TaskPreconditionError(
        `${file} is not a TypeScript source file.`,
      );
    }
    const source = await readText(ctx, file);
    if (source === null)
      throw new TaskPreconditionError(`File not found: ${file}`);
    const count = countExplicitAny(source);
    if (count === 0) {
      throw new TaskPreconditionError(`${file} has no explicit any.`);
    }
    if (!ctx.hasScript("typecheck") && !(await ctx.exists("tsconfig.json"))) {
      throw new TaskPreconditionError(
        "No typecheck script and no tsconfig.json; cannot typecheck.",
      );
    }
    ctx.log(`Baseline: ${count} explicit any in ${file}.`);
    return { any: count, suppressions: countTypeSuppressions(source) };
  },
  async verify(ctx) {
    const file = ctx.params.file as string;
    const before = dataSchema.parse(ctx.baseline.data);
    const source = await readText(ctx, file);
    if (source === null) {
      return { outcome: "fail", reasons: [`${file} was deleted.`] };
    }
    const count = countExplicitAny(source);
    const reasons = [`Explicit any in ${file}: ${before.any} → ${count}.`];
    if (count >= before.any) return { outcome: "fail", reasons };

    let partial = count > 0;
    const suppressions = countTypeSuppressions(source);
    if (suppressions > before.suppressions) {
      partial = true;
      reasons.push(
        `Type-check suppressions added: ${before.suppressions} → ${suppressions}.`,
      );
    }
    const scripts = await changedScripts(ctx, ["typecheck"]);
    if (scripts.length > 0) {
      partial = true;
      reasons.push(scriptChangeReason(scripts));
    }
    const result = await typecheck(ctx);
    if (result === null || result.code !== 0) {
      partial = true;
      reasons.push(
        result === null
          ? "TypeScript is not installed locally; typecheck did not run."
          : commandFailure("typecheck", result),
      );
    } else {
      reasons.push("typecheck passed.");
    }
    return { outcome: partial ? "partial" : "pass", reasons };
  },
});
