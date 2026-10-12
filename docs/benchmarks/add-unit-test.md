# add-unit-test

Add unit tests for an untested function. Category: testing. Scope: small.

```sh
omot bench start add-unit-test --param file=src/utils/format.ts --param function=formatPrice --agent <your-agent>
```

## Parameters

| Name       | Kind       | Description                                 | Example               |
| ---------- | ---------- | ------------------------------------------- | --------------------- |
| `file`     | path       | The source file that contains the function. | `src/utils/format.ts` |
| `function` | identifier | The exported function to test.              | `formatPrice`         |

## Preconditions

- A test script (scripts.test) and a test runner.
- The named file exists and contains the named function.

## Outcomes

- **pass**: New or changed test files reference the function, the test script passes, and no non-test files changed.
- **partial**: Tests were added and pass, but non-test files changed, test files were deleted, or no test references the function.
- **fail**: No test files were added or changed, or the test script fails.

## How it is verified

- A test file is any `*.test.*`/`*.spec.*` file, `.snap` file, or file under `test/`, `tests/`, or `__tests__/`.
- Compares the working tree (including uncommitted and untracked files) with the baseline commit.
- Checks that a changed test file imports the target (including extensionless, index, and `@/`/`~/` aliases), uses the function in code, and adds at least one test case; comments and strings do not count.
- Requires `scripts.test` and verifies it passes at the baseline before starting. If it is missing, `omot scan --fix` can generate the test script and other CI pieces.
- Runs the `test` script after changes; the start-time test result is retained as baseline health.

The prompt and verifier live in [`packages/benchmarks/src/tasks/add-unit-test`](../../packages/benchmarks/src/tasks/add-unit-test). Changing either requires a `version` bump in `task.json`.
