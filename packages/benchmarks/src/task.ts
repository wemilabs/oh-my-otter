import { taskManifestSchema, verifyResultSchema } from "./schema";
import type { Task, TaskDefinition, VerifyContext } from "./types";

export function defineTask<TData>(definition: TaskDefinition<TData>): Task {
  const parsed = taskManifestSchema.safeParse(definition.manifest);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "task"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid task.json: ${issues}`);
  }
  const manifest = parsed.data;
  const prompt = definition.prompt.replace(/\r\n/g, "\n").trim() + "\n";
  for (const match of prompt.matchAll(/\{\{\s*([a-z][a-z0-9-]*)\s*\}\}/g)) {
    if (!manifest.params.some((param) => param.name === match[1])) {
      throw new Error(
        `Task ${manifest.id}: prompt.md uses unknown param "${match[1]}".`,
      );
    }
  }
  return {
    manifest,
    prompt,
    ...(definition.prepare ? { prepare: definition.prepare } : {}),
    async verify(ctx) {
      const result = await definition.verify(ctx as VerifyContext<TData>);
      return verifyResultSchema.parse(result);
    },
  };
}
