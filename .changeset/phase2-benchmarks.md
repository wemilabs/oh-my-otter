---
"@oh-my-otter/benchmarks": minor
"oh-my-otter": minor
---

Add `omot bench list/show/start/verify` and the new `@oh-my-otter/benchmarks` package with six locally verified tasks (`dep-patch-bump`, `add-unit-test`, `fix-lint-rule`, `a11y-img-alt`, `ts-strict-file`, `fix-failing-test`). Oh My Otter is now agent-neutral: it works with any AI coding agent (Devin, Claude Code, Cursor, Codex, Copilot, and others), and `bench start --agent <name>` records which one in `.omot/run.json`.
