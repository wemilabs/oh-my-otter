---
title: Writing a check
description: A check is a read-only test of one repository-readiness property.
---

> **Security:** Local `omot.config.*` and plugin modules execute arbitrary code with your privileges. Zod validates their shape only after that code has run; plugins are not sandboxed. The no-network guarantee applies to built-in checks only. Load only trusted plugins and configs, just as you would dependencies.

A check is a read-only test of one repository-readiness property. It has a stable kebab-case `id`, a title, one of the `setup`, `verification`, `docs`, or `hygiene` categories, a weight from 1 to 5, a one-sentence `why`, and an async `run` function.

Checks should be deterministic and local. They must not make network requests or modify scanned files. `ctx.glob` excludes `node_modules` and `.git`, then applies the repository root's `.gitignore`; nested `.gitignore` files are not loaded. `ctx.read` and `ctx.exists` are not filtered by `.gitignore`. An optional `fix` returns a `FixPlan` of files to create; the fix applier never overwrites existing files.

```ts
export interface CheckContext {
  root: string;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string | null>;
  glob(pattern: string): Promise<string[]>;
  packageJson: Record<string, unknown> | null;
  run(cmd: string, opts?: { timeoutMs?: number }): Promise<{ code: number }>;
}

export interface Check {
  id: string;
  title: string;
  category: "setup" | "verification" | "docs" | "hygiene";
  weight: number;
  why: string;
  run(ctx: CheckContext): Promise<CheckResult>;
  fix?(ctx: CheckContext): Promise<FixPlan>;
}

export interface CheckResult {
  status: "pass" | "fail" | "warn" | "na";
  detail?: string;
  fix?: string;
}

export type FixPlan = Array<{ path: string; contents: string }>;
```

## Plugin template

Export an array as the plugin module's default export:

```ts
import { defineCheck } from "oh-my-otter";

const plugin = [
  {
    id: "has-license",
    title: "License file",
    category: "docs",
    weight: 2,
    why: "A license tells an agent how it may reuse the project.",
    async run(ctx) {
      return (await ctx.exists("LICENSE"))
        ? { status: "pass", detail: "LICENSE exists" }
        : { status: "fail", detail: "LICENSE is missing" };
    },
  },
];

export default plugin;
```

Load it with `omot scan --plugin ./checks.ts` or list it in `omot.config.ts`:

```ts
export default {
  plugins: ["./checks.ts"],
};
```

Plugin paths are resolved relative to the config or scan root. Checks are validated before they run, and duplicate ids are rejected.

## Adding a built-in check

Create `packages/checks/src/checks/<id>.ts` with a default export created by `defineCheck`, then add one named re-export line to `packages/checks/src/registry.ts`.
