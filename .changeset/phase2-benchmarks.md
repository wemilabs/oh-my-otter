---
"oh-my-otter": minor
---

Add `omot bench list/show/start/verify` with six locally verified benchmark tasks (`dep-patch-bump`, `add-unit-test`, `fix-lint-rule`, `a11y-img-alt`, `ts-strict-file`, `fix-failing-test`). Oh My Otter is now agent-neutral: it works with any AI coding agent (Devin, Claude Code, Cursor, Codex, Copilot, and others), and `bench start --agent <name>` records which one in `.omot/run.json` (optionally with `--agent-version` and `--model`). The tasks live in a private workspace package that is bundled into the CLI, so no new npm package is published.
