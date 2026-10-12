import * as registry from "./registry";
import type { Task } from "./types";

export const builtinTasks: readonly Task[] = Object.values(registry);

export function getTask(id: string): Task | undefined {
  return builtinTasks.find((task) => task.manifest.id === id);
}

export {
  AGENT_PATTERN,
  DEFAULT_AGENT,
  RUN_SCHEMA_VERSION,
  normalizeAgent,
  parseParams,
  renderPrompt,
  runFileSchema,
  taskManifestSchema,
  verifyResultSchema,
} from "./schema";
export type { RunFile, TaskManifest, TaskParam, VerifyResult } from "./schema";
export {
  createPrepareContext,
  createVerifyContext,
  headCommit,
  resolveRepoRoot,
  runGit,
} from "./context";
export {
  OMOT_DIR,
  OMOT_IGNORE_LINE,
  applyGitignore,
  planGitignore,
  type GitignorePlan,
} from "./lib/gitignore";
export { RUN_FILE, readRunFile, writeRunFile } from "./lib/run-file";
export { defineTask } from "./task";
export { TaskPreconditionError } from "./types";
export type {
  ChangedFile,
  CommandResult,
  PrepareContext,
  RepoContext,
  Task,
  VerifyContext,
} from "./types";
