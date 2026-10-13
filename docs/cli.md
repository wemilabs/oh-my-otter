---
title: CLI reference
description: Reference for the omot scan, checks, bench, and report commands.
---

The `oh-my-otter` npm package provides the `omot` executable. If the first argument is not a command, it is treated as a path to scan. With no arguments, `omot` scans the current directory.

## `omot scan [path]`

Scan a repository for agent readiness. `scan` is the default command.

```sh
omot scan [path] [options]
```

| Option                 | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| `--run`                | Execute repository test scripts.                                                 |
| `--json`               | Print a machine-readable JSON report.                                            |
| `--fix`                | Preview and optionally apply create-only fixes.                                  |
| `-y, --yes`            | Apply fixes without prompting; used with `--fix`.                                |
| `--badge`              | Print a Markdown badge.                                                          |
| `--plugin <specifier>` | Load a plugin by file path or package. Repeat to load more than one plugin.      |
| `--min-score <n>`      | Fail if the score is below this threshold; `n` must be an integer from 0 to 100. |

Without `--min-score`, a completed scan exits with code 0 regardless of its score. With the option, it exits with code 1 when the score is below the threshold. Invalid thresholds and other command errors also exit with code 1. `--yes` has no effect without `--fix`.

`--fix` previews create-only fixes. It never overwrites existing files. Use `--yes` to apply the planned fixes without an interactive prompt.

## `omot checks [path]`

List built-in and plugin checks for a repository.

```sh
omot checks [path] [--plugin <specifier>] [--json]
```

`--plugin <specifier>` loads a plugin by file path or package and can be repeated. `--json` prints the checks as JSON. A successful listing exits with code 0; command errors exit with code 1.

## `omot bench`

Benchmark commands use standardized tasks. Results are stored locally in `.omot/run.json`.

### `omot bench list`

List the available benchmark tasks.

```sh
omot bench list [--json]
```

`--json` prints task manifests as JSON. A successful listing exits with code 0.

### `omot bench show <id>`

Show a task's prompt and requirements.

```sh
omot bench show <id> [--param <key=value>]... [--json]
```

| Option                | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| `--param <key=value>` | Fill in a prompt parameter. Repeat for multiple parameters. |
| `--json`              | Print the task and rendered prompt as JSON.                 |

### `omot bench start <id> [path]`

Record a baseline in `.omot/run.json` and print the prompt.

```sh
omot bench start <id> [path] [options]
```

| Option                      | Description                                                            |
| --------------------------- | ---------------------------------------------------------------------- |
| `--param <key=value>`       | Set a task parameter. Repeat for multiple parameters.                  |
| `--agent <name>`            | Coding agent being benchmarked; stored as a slug.                      |
| `--agent-version <version>` | Version of the coding agent.                                           |
| `--model <name>`            | Model used by the coding agent; stored as a slug.                      |
| `--skip-baseline-scripts`   | Skip task scripts at start; baseline health will be unknown.           |
| `-y, --yes`                 | Confirm `.gitignore` and `fix-failing-test` changes without prompting. |

The working tree must be clean so the baseline matches the repository. Starting a task records its baseline and readiness scan, runs available baseline scripts unless `--skip-baseline-scripts` is set, and writes `.omot/run.json`. It may append `.omot/` to `.gitignore` or create that file. Use `-y` to confirm those changes and any replacement of an existing run without prompting.

### `omot bench verify [path]`

Run the task verifier and record its result in `.omot/run.json`.

```sh
omot bench verify [path] [options]
```

| Option                      | Description                                            |
| --------------------------- | ------------------------------------------------------ |
| `--corrections <n>`         | Number of times you corrected or redirected the agent. |
| `--minutes <n>`             | Minutes of human effort.                               |
| `--agent <name>`            | Override the agent recorded at start.                  |
| `--agent-version <version>` | Override the agent version recorded at start.          |
| `--model <name>`            | Override the model recorded at start.                  |
| `--json`                    | Print the updated run as JSON.                         |

When run interactively, `verify` asks for the correction and effort values if they are not supplied. In a non-interactive terminal, pass both `--corrections <n>` and `--minutes <n>`. It exits with code 1 for a failed verification; pass and partial outcomes exit with code 0.

## `omot report [path]`

Preview and submit an anonymous benchmark result. Nothing is sent without confirmation.

```sh
omot report [path] [--dry-run]
```

| Option      | Description                                  |
| ----------- | -------------------------------------------- |
| `--dry-run` | Print the report payload without submitting. |

Reporting requires a verified run. The command prints the exact data it would submit, then asks whether to open a prefilled GitHub issue. Nothing is sent until you review and create the issue. `--dry-run` prints the payload and exits with code 0 without submitting. A missing verified result or other error exits with code 1.
