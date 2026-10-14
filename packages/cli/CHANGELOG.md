# oh-my-otter

## 0.5.2

### Patch Changes

- Updated dependencies [e51ea50]
  - @oh-my-otter/checks@0.5.2
  - @oh-my-otter/core@0.5.2

## 0.5.1

### Patch Changes

- 452f7ab: Mention Droid in the CLI help text and package keywords.
- @oh-my-otter/checks@0.5.1
  - @oh-my-otter/core@0.5.1

## 0.5.0

### Minor Changes

- 6c4110b: Add branch-aware benchmark runs and cleanup, plus clearer test-script guidance and verification follow-up hints.
- 0f8e5f2: Add Biome support to the lint benchmark and mutation testing to the unit-test benchmark. The expanded plus/minus operator detection also changes mutation selection for `fix-failing-test`.

### Patch Changes

- Updated dependencies [6c4110b]
  - @oh-my-otter/checks@0.5.0
  - @oh-my-otter/core@0.5.0

## 0.4.1

### Patch Changes

- 0e39a8b: The dep-patch-bump benchmark now checks that the bumped version is installed in node_modules; a bump that was never installed is partial instead of passing.
- 16b69df: Harden dependency bump verification for workspace lock entries, legacy pnpm specifiers, and npm shrinkwrap precedence.
- @oh-my-otter/checks@0.4.1
  - @oh-my-otter/core@0.4.1

## 0.4.0

### Minor Changes

- 438eaa0: Add `omot report`: preview and submit an anonymous benchmark result via a prefilled GitHub issue (nothing is sent without confirmation; `--dry-run` prints the payload only). `omot bench start` now records the repo's readiness score and stack at start so reports reflect the baseline.

### Patch Changes

- e74336d: Harden benchmark records, verifier output, installation docs, report ingestion, and website navigation.
- Updated dependencies [e74336d]
  - @oh-my-otter/checks@0.4.0
  - @oh-my-otter/core@0.4.0

## 0.3.0

### Minor Changes

- c230425: Record baseline script health and retain each benchmark verification attempt.

### Patch Changes

- ce0d1e8: Scope benchmark import aliases to the target module and detect baseline edits to pre-dirty files.
- Updated dependencies [89b874f]
  - @oh-my-otter/checks@0.3.0
  - @oh-my-otter/core@0.3.0

## 0.2.0

### Minor Changes

- 2f5b53a: Add `omot bench list/show/start/verify` with six locally verified benchmark tasks (`dep-patch-bump`, `add-unit-test`, `fix-lint-rule`, `a11y-img-alt`, `ts-strict-file`, `fix-failing-test`). Oh My Otter is now agent-neutral: it works with any AI coding agent (Devin, Claude Code, Cursor, Codex, Copilot, and others), and `bench start --agent <name>` records which one in `.omot/run.json` (optionally with `--agent-version` and `--model`). The tasks live in a private workspace package that is bundled into the CLI, so no new npm package is published.

### Patch Changes

- @oh-my-otter/checks@0.2.0
  - @oh-my-otter/core@0.2.0

## 0.1.0

### Minor Changes

- a41deb6: Initial Phase 1 release of the core scanner, CLI, and built-in checks.

### Patch Changes

- Updated dependencies [a41deb6]
  - @oh-my-otter/core@0.1.0
  - @oh-my-otter/checks@0.1.0
