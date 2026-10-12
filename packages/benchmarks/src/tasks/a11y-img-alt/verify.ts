import { z } from "zod";
import { commandFailure } from "../../context";
import { imageFileGlob, scanImages } from "../../lib/images";
import { changedScripts, scriptChangeReason } from "../../lib/scripts";
import { defineTask } from "../../task";
import { TaskPreconditionError, type RepoContext } from "../../types";
import manifest from "./task.json";
import prompt from "./prompt.md";

const dataSchema = z.object({
  missing: z.number().int().min(0),
  total: z.number().int().min(0),
  files: z.record(z.string(), z.number().int().min(0)).default({}),
});
type Data = z.infer<typeof dataSchema>;

async function scanDir(
  ctx: RepoContext,
  dir: string,
): Promise<{
  missing: number;
  total: number;
  files: Record<string, number>;
  locations: string[];
}> {
  const prefix = dir === "." ? "" : `${dir}/`;
  const files = await ctx.glob(`${prefix}${imageFileGlob}`);
  let missing = 0;
  let total = 0;
  const totals: Record<string, number> = {};
  const locations: string[] = [];
  for (const file of files.sort()) {
    const source = await ctx.read(file);
    if (source === null) continue;
    const scan = scanImages(source);
    total += scan.total;
    if (scan.total > 0) totals[file] = scan.total;
    missing += scan.missing.length;
    for (const line of scan.missing) locations.push(`${file}:${line}`);
  }
  return { missing, total, files: totals, locations };
}

export default defineTask<Data>({
  manifest,
  prompt,
  async prepare(ctx) {
    const dir = ctx.params.dir as string;
    if (!ctx.hasScript("build")) {
      throw new TaskPreconditionError("No build script (scripts.build) found.");
    }
    if (dir !== "." && !(await ctx.exists(dir))) {
      throw new TaskPreconditionError(`Directory not found: ${dir}`);
    }
    const scan = await scanDir(ctx, dir);
    if (scan.missing === 0) {
      throw new TaskPreconditionError(
        `No <img> or <Image> tags missing alt under ${dir}.`,
      );
    }
    ctx.log(
      `Baseline: ${scan.missing} of ${scan.total} image tag(s) missing alt.`,
    );
    return { missing: scan.missing, total: scan.total, files: scan.files };
  },
  async verify(ctx) {
    const dir = ctx.params.dir as string;
    const before = dataSchema.parse(ctx.baseline.data);
    const after = await scanDir(ctx, dir);
    const reasons = [
      `Image tags missing alt: ${before.missing} → ${after.missing}.`,
    ];
    if (after.locations.length > 0) {
      reasons.push(`Still missing: ${after.locations.slice(0, 5).join(", ")}.`);
    }
    if (after.missing >= before.missing) return { outcome: "fail", reasons };

    let partial = after.missing > 0;
    if (after.total < before.total) {
      partial = true;
      reasons.push(`Image tags removed: ${before.total} → ${after.total}.`);
    }
    const shrunk = Object.entries(before.files)
      .filter(([file, count]) => (after.files[file] ?? 0) < count)
      .map(([file]) => file);
    if (shrunk.length > 0 && after.total >= before.total) {
      partial = true;
      reasons.push(
        `Image tags removed from: ${shrunk.slice(0, 5).join(", ")}.`,
      );
    }
    const scripts = await changedScripts(ctx, ["build"]);
    if (scripts.length > 0) {
      partial = true;
      reasons.push(scriptChangeReason(scripts));
    }
    const result = await ctx.runScript("build");
    if (result === null || result.code !== 0) {
      partial = true;
      reasons.push(
        result === null
          ? "No build script."
          : commandFailure("build script", result),
      );
    } else {
      reasons.push("build script passed.");
    }
    return { outcome: partial ? "partial" : "pass", reasons };
  },
});
