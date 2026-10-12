# Oh My Otter repository guide

## Layout

- `packages/core`: shared check types, scoring, validation, and Node helpers.
- `packages/checks`: built-in checks; fixtures are under `packages/checks/test/fixtures/`.
- `packages/cli`: the `omot` command-line interface.

## Commands

- `pnpm install`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm build`
- `pnpm test`

## Rules

- The scanner makes no network calls; checks are read-only.
- `--fix` is create-only and must never overwrite existing files.
- Add a built-in check as one file in `packages/checks/src/checks/`, one line in `packages/checks/src/registry.ts`, and one row in the README check table.
- `omot scan` is canonical; `init` is a hidden legacy alias.
- Add a changeset for user-facing changes.
