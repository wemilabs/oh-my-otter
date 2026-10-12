# fix-lint-rule

Fix every violation of one ESLint rule. Category: lint. Scope: medium.

```sh
omot bench start fix-lint-rule --param rule=prefer-const --agent <your-agent>
```

## Parameters

| Name   | Kind | Description                | Example        |
| ------ | ---- | -------------------------- | -------------- |
| `rule` | rule | The ESLint rule ID to fix. | `prefer-const` |

## Preconditions

- ESLint is installed locally and configured with the rule enabled.
- At least one violation of the rule at the baseline.
- A test script (scripts.test).

## Outcomes

- **pass**: ESLint reports zero violations of the rule, no new disable comments or ESLint config changes, and the test script passes.
- **partial**: Violations dropped but not to zero, or they reached zero by disabling the rule, or tests fail.
- **fail**: The violation count did not drop, or ESLint could not run.

## How it is verified

- Runs the locally installed ESLint (`node_modules/eslint`) as `eslint . --format json` and counts messages whose `ruleId` is the rule; the baseline count is recorded at start.
- New `eslint-disable` directives that cover the rule (or disable everything), and changes to ESLint config files, make the result partial.
- Runs the `test` script.
- The test exit code is recorded at start. A failure that also occurred at baseline is not counted against the agent; if baseline scripts were skipped, a later failure is reported with unknown baseline health.

The prompt and verifier live in [`packages/benchmarks/src/tasks/fix-lint-rule`](../../packages/benchmarks/src/tasks/fix-lint-rule). Changing either requires a `version` bump in `task.json`.
