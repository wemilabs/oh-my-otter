# Oh My Otter

An open-source benchmark and optimization toolkit for seamless Devin integration.

Oh My Otter is unofficial and independent. It is not affiliated with or endorsed by Cognition.

## What it does

### 1. Scan your repo

`omot scan` checks your repo for the things Devin depends on, such as runnable tests, documented setup, lint and typecheck scripts, and CI. You get a readiness score and a list of specific, fixable findings. Run `omot scan --fix` to generate missing pieces. The scan runs entirely on your machine and makes no network calls.

### 2. Benchmark Devin on your code

`omot bench` gives you a small set of standardized tasks, such as bumping a dependency or adding a unit test. Run one with Devin, then let the CLI verify the result locally, so the outcome is a clear pass, partial, or fail instead of an opinion. You also record how many human corrections it took.

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
