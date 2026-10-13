---
title: Run a benchmark and submit it
description: Benchmark the coding agent you already use on your own repository, then submit an anonymous result.
---

Run one standardized task with your coding agent (for example Claude Code, Codex, Cursor, Droid, Devin, or Copilot) on your own repository, verify the result locally, and optionally submit it to the public [results](https://ohmyotter.vercel.app/results).

## Prerequisites

- Node.js **22.13 or later**.
- A Git repository with a **clean working tree**: commit or stash your changes first.
- Installed dependencies, so the repository's own scripts (build, test, lint, typecheck) can run.

## 1. Pick a task

```sh
npx oh-my-otter bench list
```

Start with [`fix-failing-test`](./benchmarks/fix-failing-test.md) or [`dep-patch-bump`](./benchmarks/dep-patch-bump.md). An agent is ranked on a task only after 5 or more reports, so results rank sooner when reports cluster on a few tasks.

Each task page lists its parameters and preconditions. `fix-failing-test` needs a passing `test` script; `dep-patch-bump` needs a committed lockfile.

## 2. Start the run

```sh
npx oh-my-otter bench start fix-failing-test --param file=src/lib/math.ts --agent claude-code --model claude-sonnet-4-5
npx oh-my-otter bench start dep-patch-bump --param package=zod --agent codex --model gpt-5 --branch bench/zod
```

`start` records a baseline in `.omot/run.json` and prints the prompt. `--agent` and `--model` are optional free-form names stored as slugs; `--agent-version <version>` is optional too. `--branch <name>` creates and switches to a new branch for the run; `fix-failing-test` creates its own branch and does not accept it. Pass `--yes` to confirm the `.gitignore` and branch changes without prompting.

## 3. Paste the prompt into your coding agent

Give the agent the printed prompt as-is and let it work. Then pull or merge its changes into this working tree.

## 4. Verify

```sh
npx oh-my-otter bench verify --corrections 1 --minutes 10
```

`--corrections` is how many times you corrected or redirected the agent; `--minutes` is your own effort in minutes. The verifier runs the repository's scripts locally and prints **pass**, **partial**, or **fail** with reasons. You can run it again after more agent work; each attempt is recorded.

## 5. Report

```sh
npx oh-my-otter report
```

`report` prints the exact JSON it would submit: task id and version, outcome, corrections, minutes, attempts, the agent, agent version, and model slugs, the readiness score and per-check statuses from `start`, a coarse stack summary, and the date. It never includes repository names, paths, code, commits, or dependency names; [PRIVACY.md](https://github.com/wemilabs/oh-my-otter/blob/main/PRIVACY.md) lists every field.

After you confirm, it opens a prefilled GitHub issue in your browser (or copies the JSON to your clipboard when it is too long for a URL). **Nothing is sent until you create the issue.** Use `--dry-run` to print the payload only. Results update hourly.

## 6. Clean up

```sh
npx oh-my-otter bench clean --delete-branch
```

`clean` removes `.omot/run.json`. `--delete-branch` also deletes the branch omot created for the run; without it the branch is kept.

See the [CLI reference](./cli.md) for every option.
