# Contributing to Oh My Otter

Thanks for helping make repositories easier for AI coding agents to work in. By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md), not in public issues.

## Setup

You need Node.js `>=22.13` (`.nvmrc` pins 22) and pnpm 12 (pinned in `package.json` `packageManager`; `corepack enable` picks it up).

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

Run `pnpm format` to fix formatting. [`AGENTS.md`](AGENTS.md) describes the layout and the repository rules; they apply to human contributors too.

## Pull requests

- Branch from `v1-dev` and open your PR against `v1-dev`.
- `main` is release-only: maintainers merge `v1-dev` into it to publish. Don't target `main`.
- CI runs typecheck, lint, format check, build, and tests on Linux, macOS, and Windows, plus the benchmark task version check. Keep it green.
- Fill in the PR template checklist.

## Adding a check

A built-in check is one file, one registry line, and one README row:

1. Create `packages/checks/src/checks/<id>.ts` with a default export from `defineCheck`.
2. Add one re-export line to `packages/checks/src/registry.ts`.
3. Add a row to the "Built-in checks" table in [`README.md`](README.md).
4. Add tests in `packages/checks/test/targeted.test.ts`, and update the check count in `packages/checks/test/registry.test.ts` and the expected statuses and scores in `packages/checks/test/fixtures.test.ts`.

Explain the weight (1–5) in your PR: weights change every repository's score (see [`docs/scoring.md`](docs/scoring.md)). Checks are read-only and make no network calls. See [writing a check](docs/writing-a-check.md) for the API. To propose a check first, open a [new check issue](https://github.com/wemilabs/oh-my-otter/issues/new?template=new-check.yml).

## Adding a benchmark task

A task is one folder, one registry line, one docs page, and tests:

1. Create `packages/benchmarks/src/tasks/<id>/` with `task.json`, `prompt.md`, and `verify.ts`.
2. Add one line to `packages/benchmarks/src/registry.ts`.
3. Add `docs/benchmarks/<id>.md`.
4. Add pass, partial, and fail tests in `packages/benchmarks/test/<id>.test.ts`.

Any change to an existing task's `prompt.md` or `verify.ts` needs a `version` bump in its `task.json`, so results from different versions are never mixed. CI enforces this and the docs page; run it locally with `node packages/benchmarks/scripts/check-task-versions.mjs --base origin/v1-dev`. See [writing a task](docs/writing-a-task.md) for details. To propose a task first, open a [new task issue](https://github.com/wemilabs/oh-my-otter/issues/new?template=new-task.yml).

## Changesets

Add a changeset (`pnpm changeset`) for user-facing changes to the published packages: `oh-my-otter`, `@oh-my-otter/core`, and `@oh-my-otter/checks`. `apps/web` and `@oh-my-otter/benchmarks` are private and never versioned, so changes only there need none (benchmark changes reach users through the CLI, so add an `oh-my-otter` changeset for those).

## Submitting a benchmark report

Run a task with `omot bench start` and `omot bench verify`, then run `omot report`. It prints the exact JSON first and only opens a prefilled issue after you confirm; nothing is sent until you click **Create**. Paste the JSON unedited. [`PRIVACY.md`](PRIVACY.md) lists every field.

## Wording

Oh My Otter is agent-neutral. In prompts, docs, check text, and the site, say "coding agent" or "agent", never a single vendor's name. Name vendors only when listing several as examples.
