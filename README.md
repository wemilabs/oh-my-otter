# Oh My Otter

An open-source benchmark and optimization toolkit for AI coding agents: Devin, Claude Code, Cursor, Codex, Copilot, and others.

Oh My Otter is unofficial and independent; not affiliated with or endorsed by Cognition or any other agent vendor.

## What it does

### 1. Scan your repo

`omot scan` checks your repo for the things AI coding agents depend on, such as runnable tests, documented setup, lint and typecheck scripts, and CI. You get a readiness score and a list of specific, fixable findings. Run `omot scan --fix` to generate missing pieces. The scan runs entirely on your machine and makes no network calls.

### 2. Benchmark your coding agent on your code

`omot bench` gives you a small set of standardized tasks, such as bumping a dependency or adding a unit test. Paste its prompt into your coding agent, then let the CLI verify the result locally, so the outcome is a clear pass, partial, or fail instead of an opinion. You also record how many human corrections it took.

### 3. Share results and see the data

`omot report` shows you the exact data it would send, and sends nothing until you confirm. Reports contain only coarse, anonymous fields: no code, file names, or repo details. The website turns submitted reports into public aggregate results, showing whether higher readiness scores go with fewer corrections.

## Quickstart

```sh
npx oh-my-otter scan
pnpm dlx oh-my-otter scan
```

Scans run locally and make no network calls.

## Usage

```sh
omot scan [path] [--run] [--json] [--fix] [--yes] [--badge]
          [--plugin <path|package>] [--min-score <n>]
omot checks [path] [--plugin <path|package>] [--json]
```

Use `--run` to execute the repository's test script. `--fix` previews create-only fixes; confirm interactively or use `--yes` to apply them. `--json` prints a machine-readable report, `--badge` prints a Markdown badge, and `--min-score` sets a CI threshold.

## Benchmarks

```sh
omot bench list [--json]
omot bench show <id> [--param key=value ...] [--json]
omot bench start <id> [path] [--param key=value ...] [--agent <name>] [--yes]
omot bench verify [path] [--corrections <n>] [--minutes <n>] [--agent <name>] [--json]
```

| Task               | What the agent does                                | Params             |
| ------------------ | -------------------------------------------------- | ------------------ |
| `dep-patch-bump`   | Bump one dependency within its major version       | `package`          |
| `add-unit-test`    | Add tests for one function without touching source | `file`, `function` |
| `fix-lint-rule`    | Fix every violation of one ESLint rule             | `rule`             |
| `a11y-img-alt`     | Add missing `alt` attributes under a directory     | `dir`              |
| `ts-strict-file`   | Remove explicit `any` from one file                | `file`             |
| `fix-failing-test` | Fix a bug omot introduces on a throwaway branch    | `file`             |

Each task has a docs page in [`docs/benchmarks`](docs/benchmarks).

1. Commit your work, then run `omot bench start add-unit-test --param file=src/format.ts --param function=formatPrice --agent claude-code`. It records the baseline commit and start time in `.omot/run.json` and prints the prompt.
2. Paste the prompt into your coding agent and let it work. Pull or merge its changes into your working tree.
3. Run `omot bench verify`. The verifier compares the repo with the baseline and runs the repository's own scripts (build, test, lint, typecheck) locally, then prints pass, partial, or fail with reasons. It asks how many times you corrected the agent and how many minutes of human effort it took; pass `--corrections <n> --minutes <n>` to skip the questions in scripts. It exits 1 on fail.

`--agent` is optional and works with any coding agent. It is stored as a lowercase slug of at most 40 characters from `[a-z0-9._-]` (for example `"Claude Code"` becomes `claude-code`); the default is `unknown`. `verify --agent` overrides the value from `start`.

`start` offers to append one line, `.omot/`, to `.gitignore` (or create it); confirm or pass `--yes`. That is the only existing file it edits. `fix-failing-test` asks first, then creates a branch named `omot/fix-failing-test-<timestamp>` and commits a one-operator bug there; your current branch is untouched. Results stay in `.omot/run.json`; `omot bench` sends nothing anywhere.

To add a task, see [writing a task](docs/writing-a-task.md).

## Built-in checks

| Check                        | Weight | Category     |
| ---------------------------- | -----: | ------------ |
| `package-manager-lockfile`   |      5 | setup        |
| `node-version-pinned`        |      3 | setup        |
| `install-documented`         |      4 | docs         |
| `test-script`                |      5 | verification |
| `tests-exist`                |      4 | verification |
| `tests-pass`                 |      5 | verification |
| `lint-script`                |      3 | verification |
| `typecheck-script`           |      3 | verification |
| `build-script`               |      4 | verification |
| `ci-config`                  |      3 | hygiene      |
| `env-example`                |      3 | setup        |
| `formatter-config`           |      2 | hygiene      |
| `contributing-or-agents-doc` |      2 | docs         |
| `gitignore-sane`             |      2 | hygiene      |

## CI usage

```sh
omot scan --min-score 80
```

The command exits nonzero if the score is below the chosen threshold.

## Plugins

Add custom checks with a plugin; see the [plugin authoring guide](docs/writing-a-check.md).

Security: `omot.config.*` files and plugins execute as code when scanning a repository, so only scan repositories you trust, just as you would with ESLint configs. Built-in checks only read files and never execute anything unless you pass `--run`.

## Badge

Run `omot scan --badge` to print a static Shields.io badge snippet.

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm format
```
