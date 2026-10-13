---
title: fix-failing-test
description: Fix a deliberately introduced failing test.
---

Fix a deliberately introduced failing test. Category: testing. Scope: small.

```sh
omot bench start fix-failing-test --param file=src/lib/math.ts --agent <your-agent>
```

## Parameters

| Name   | Kind | Description                                                               | Example           |
| ------ | ---- | ------------------------------------------------------------------------- | ----------------- |
| `file` | path | A source file covered by the tests; omot introduces a one-token bug here. | `src/lib/math.ts` |

## Preconditions

- A clean working tree and a test script (`scripts.test`) that passes at the baseline.
- The file is a non-test source file whose tests catch a flipped operator.
- You confirm that omot may create a throwaway branch and commit the bug there.

## Outcomes

- **pass**: The test script passes, no test file was deleted or modified, and no tests were skipped.
- **partial**: The test script passes, but test files were modified.
- **fail**: The test script fails, a test file was deleted, or tests were skipped.

## How it is verified

- `bench start` requires a clean working tree and a passing `test` script; a baseline failure blocks the task and reports the output tail. After you confirm (or pass `--yes`), it creates the branch `omot/fix-failing-test-<timestamp>`, flips one operator in the file (for example `>=` to `>`), and records the changed tree in a single parentless commit named `bench baseline`. The commit has no parent, so its history exposes no diff; the original branch commit and real index are untouched. This is not a security boundary: an agent can still inspect other refs such as `origin/main` or the reflog.
- The prompt does not name the file, so the agent has to find the bug.
- `bench verify` runs the `test` script and compares test files with the baseline: deleted test files or new `.skip`/`.only`/`.todo`/`xit` markers fail the run, and any other test file edit makes it partial.
- Every verification is appended to `.omot/run.json`, with its own commit and result; the latest result records how many attempts were made.
- When you are done, switch back with `git switch -` and delete the branch with `git branch -D omot/fix-failing-test-<timestamp>`.

The prompt and verifier live in [`packages/benchmarks/src/tasks/fix-failing-test`](https://github.com/wemilabs/oh-my-otter/tree/v1-dev/packages/benchmarks/src/tasks/fix-failing-test). Changing either requires a `version` bump in `task.json`.
