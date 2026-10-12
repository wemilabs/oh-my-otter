# Oh My Otter repository guide

## Layout

- `packages/core`: shared check types, scoring, validation, and Node helpers.
- `packages/checks`: built-in checks; fixtures are under `packages/checks/test/fixtures/`.
- `packages/benchmarks`: benchmark tasks (`src/tasks/<id>/`), verifiers, and the `.omot/run.json` schema; fixture repos are built in tests.
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
- Add a benchmark task as one folder `packages/benchmarks/src/tasks/<id>/` with `task.json`, `prompt.md`, and `verify.ts`, one line in `packages/benchmarks/src/registry.ts`, a docs page `docs/benchmarks/<id>.md`, and pass/partial/fail tests; see `docs/writing-a-task.md`.
- Changing a task's `prompt.md` or `verify.ts` requires bumping `version` in its `task.json`; CI checks this against the PR base branch (`node packages/benchmarks/scripts/check-task-versions.mjs --base origin/<base>`).
- Prompts are agent-neutral: say "coding agent", never a vendor name.
- Bench verifiers may run repository scripts locally but make no network calls of their own.
- `omot scan` is canonical; `init` is a hidden legacy alias.
- Add a changeset for user-facing changes.

## Releasing

- Add a changeset with each user-facing change.
- Pushing to `main` runs the release workflow, which opens the “Version Packages” PR (titled `chore: release packages`); merging it publishes the packages to npm.
- Publishing uses npm Trusted Publishing (OIDC) from `.github/workflows/release.yml`; no npm token is needed.
- Configure an npmjs.com GitHub Actions trusted publisher for each package (`oh-my-otter`, `@oh-my-otter/core`, `@oh-my-otter/checks`) with org `wemilabs`, repo `oh-my-otter`, and workflow `release.yml`; allow direct `npm publish`.
- `@oh-my-otter/benchmarks` is `private` and bundled into the CLI by tsup (`noExternal`), so it's never published. It's a CLI `devDependency` and isn't in the changesets `fixed` group. Its `task.json` and `prompt.md` files are imported, so they get inlined into the bundle; don't read task assets from disk at runtime.
- PRs opened with `GITHUB_TOKEN` do not trigger CI. Close and reopen the version PR to run CI, or have an admin bypass the three required `verify` checks.
