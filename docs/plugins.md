---
title: Plugins
description: Add custom repository-readiness checks through trusted plugin modules.
---

> **Security:** Loading `omot.config.*` or a `--plugin` module executes arbitrary local code with your privileges. Zod validates the module's shape only after that code has executed. Plugins are not sandboxed, and the no-network guarantee covers built-in checks only. Load only trusted plugins and configs, just as you would dependencies.

Plugins add custom checks to `omot scan` and `omot checks`. A plugin module must default-export an array of checks. Use `defineCheck` from `oh-my-otter` to validate and type a check:

```ts
import { defineCheck } from "oh-my-otter";

export default [
  defineCheck({
    id: "has-readme",
    title: "README is present",
    category: "docs",
    weight: 2,
    why: "A README helps coding agents understand the repository.",
    async run(ctx) {
      return (await ctx.exists("README.md"))
        ? { status: "pass", detail: "README.md exists" }
        : { status: "fail", detail: "README.md is missing" };
    },
  }),
];
```

Pass a module by file path or package with `--plugin`. Repeat the flag to load multiple modules:

```sh
omot scan --plugin ./checks/has-readme.ts
omot checks --plugin ./checks/has-readme.ts --json
```

You can also list plugin specifiers in a root `omot.config.ts`:

```ts
export default {
  plugins: ["./checks/has-readme.ts"],
};
```

The CLI recognizes `omot.config.ts`, `.mts`, `.js`, and `.mjs` files and loads config and plugin modules through jiti. Plugin modules should use a default export containing an array of checks. Zod validates the config and check shapes; that validation is not a security boundary and does not sandbox module execution.

See [Writing a check](./writing-a-check.md) for the check contract and execution context.
