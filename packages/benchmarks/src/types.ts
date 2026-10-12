import type { TaskManifest, VerifyResult } from "./schema";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
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
  yes: boolean;
  isTTY: boolean;
  confirm(question: string): Promise<boolean>;
}

export interface VerifyContext<TData = unknown> extends RepoContext {
  baseline: { commit: string; data: TData };
  changedFiles(): Promise<ChangedFile[]>;
  readBaseline(path: string): Promise<string | null>;
  baselineFiles(): Promise<string[]>;
}

export interface TaskDefinition<TData = unknown> {
  manifest: unknown;
  prompt: string;
  prepare?(ctx: PrepareContext): Promise<TData>;
  verify(ctx: VerifyContext<TData>): Promise<VerifyResult>;
}

export interface Task {
  manifest: TaskManifest;
  prompt: string;
  prepare?(ctx: PrepareContext): Promise<unknown>;
  verify(ctx: VerifyContext): Promise<VerifyResult>;
}

export class TaskPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskPreconditionError";
  }
}
