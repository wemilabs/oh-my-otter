---
title: fix-lint-rule
description: Fix every violation of one ESLint or Biome rule.
---

Fix every violation of one ESLint or Biome rule. Category: lint. Scope: medium.

```sh
omot bench start fix-lint-rule --param rule=prefer-const --agent <your-agent>
```

For Biome, pass a rule such as `style/useConst` or `lint/style/useConst`:

```sh
omot bench start fix-lint-rule --param rule=style/useConst --agent <your-agent>
```

## Parameters

| Name   | Kind | Description                      | Example                            |
| ------ | ---- | -------------------------------- | ---------------------------------- |
| `rule` | rule | An ESLint rule ID or Biome rule. | `prefer-const` or `style/useConst` |

## Preconditions

- ESLint or Biome is installed locally and configured with the rule enabled.
- At least one violation of the rule at the baseline.
- A test script (scripts.test).

## Outcomes

- **pass**: The linter reports zero violations of the rule, no new disable or ignore comments or linter config changes, and the test script passes.
- **partial**: Violations dropped but not to zero, or they reached zero by disabling or ignoring the rule, changing the linter configuration, or tests fail.
- **fail**: The violation count did not drop, or the linter could not run.

## How it is verified

- For ESLint, runs the locally installed `eslint . --format json` and counts messages whose `ruleId` is the rule. For Biome, runs `biome lint . --reporter=github --max-diagnostics=none` and counts diagnostics whose title matches the normalized Biome rule ID.
- The baseline count is recorded at start. New `eslint-disable` or `biome-ignore` directives that cover the rule (or a whole group), and changes to ESLint or Biome config files, make the result partial.
- Runs the `test` script.
- The test exit code is recorded at start. A failure that also occurred at baseline is not counted against the agent; if baseline scripts were skipped, a later failure is reported with unknown baseline health.

The prompt and verifier live in [`packages/benchmarks/src/tasks/fix-lint-rule`](https://github.com/wemilabs/oh-my-otter/tree/v1-dev/packages/benchmarks/src/tasks/fix-lint-rule). Changing either requires a `version` bump in `task.json`.
