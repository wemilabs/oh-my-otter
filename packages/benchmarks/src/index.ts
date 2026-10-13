import * as registry from "./registry";
import type { Task } from "./types";

export const builtinTasks: readonly Task[] = Object.values(registry);

export function getTask(id: string): Task | undefined {
  return builtinTasks.find((task) => task.manifest.id === id);
}

export {
  AGENT_PATTERN,
  AGENT_VERSION_PATTERN,
  MODEL_PATTERN,
  DEFAULT_AGENT,
  RUN_SCHEMA_VERSION,
  normalizeAgent,
  normalizeAgentVersion,
  normalizeModel,
  parseParams,
  renderPrompt,
  migrateRunFile,
  runFileSchema,
  taskManifestSchema,
  verifyResultSchema,
} from "./schema";
export type {
  RunFile,
  TaskManifest,
  TaskParam,
  Verification,
  VerifyResult,
} from "./schema";
export {
  createPrepareContext,
  createVerifyContext,
  headCommit,
  resolveRepoRoot,
  runGit,
} from "./context";
export type { PrepareContextOptions } from "./context";
export {
  OMOT_DIR,
  OMOT_IGNORE_LINE,
  applyGitignore,
  planGitignore,
  withoutOmotLines,
  type GitignorePlan,
} from "./lib/gitignore";
export {
  RUN_FILE,
  appendVerification,
  removeRunFile,
  readRunFile,
  replaceRunFile,
  updateRunFile,
  writeRunFile,
} from "./lib/run-file";
export { detectStack, summarizeScan } from "./report/stack";
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
