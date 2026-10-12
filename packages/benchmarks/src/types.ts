import type { TaskManifest, VerifyResult } from "./schema";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  /** stdout and stderr interleaved in the order they were written. */
  output: string;
  timedOut: boolean;
}

export interface ChangedFile {
  status: "added" | "modified" | "deleted";
  path: string;
}

export interface RepoContext {
  root: string;
  params: Record<string, string>;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string | null>;
  glob(pattern: string): Promise<string[]>;
  packageJson: Record<string, unknown> | null;
  git(args: readonly string[]): Promise<string>;
  packageManager(): Promise<PackageManager>;
  hasScript(name: string): boolean;
  runScript(name: string): Promise<CommandResult | null>;
  runPackageBin(
    pkg: string,
    args: readonly string[],
    bin?: string,
  ): Promise<CommandResult | null>;
  log(text: string): void;
}

export interface PrepareContext extends RepoContext {
  /**
   * Runs the task's `scripts` that exist on the current (clean) tree once and
   * memoizes the results. Returns null when baseline scripts are skipped.
   * Tasks that change the tree must call this before changing it.
   */
  recordBaseline(): Promise<Record<string, CommandResult> | null>;
  yes: boolean;
  isTTY: boolean;
  confirm(question: string): Promise<boolean>;
}

export interface VerifyContext<TData = unknown> extends RepoContext {
  /** `scripts` holds baseline exit codes; undefined means baseline health is unknown. */
  baseline: { commit: string; data: TData; scripts?: Record<string, number> };
  changedFiles(): Promise<ChangedFile[]>;
  readBaseline(path: string): Promise<string | null>;
  baselineFiles(): Promise<string[]>;
}

export interface TaskDefinition<TData = unknown> {
  manifest: unknown;
  prompt: string;
  /** package.json scripts the verifier runs; recorded at `bench start`. */
  scripts: readonly string[];
  prepare?(ctx: PrepareContext): Promise<TData>;
  verify(ctx: VerifyContext<TData>): Promise<VerifyResult>;
}

export interface Task {
  manifest: TaskManifest;
  prompt: string;
  scripts: readonly string[];
  prepare?(ctx: PrepareContext): Promise<unknown>;
  verify(ctx: VerifyContext): Promise<VerifyResult>;
}

export class TaskPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskPreconditionError";
  }
}
