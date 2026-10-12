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
- Checks that at least one changed test file mentions the function name, then runs the `test` script.

The prompt and verifier live in [`packages/benchmarks/src/tasks/add-unit-test`](../../packages/benchmarks/src/tasks/add-unit-test). Changing either requires a `version` bump in `task.json`.
