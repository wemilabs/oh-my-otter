---
title: ts-strict-file
description: Remove explicit any from one file.
---

Remove explicit any from one file. Category: types. Scope: small.

```sh
omot bench start ts-strict-file --param file=src/api/client.ts --agent <your-agent>
```

## Parameters

| Name   | Kind | Description                      | Example             |
| ------ | ---- | -------------------------------- | ------------------- |
| `file` | path | The TypeScript file to clean up. | `src/api/client.ts` |

## Preconditions

- The file is TypeScript (.ts, .tsx, .mts, .cts) and uses explicit any at least once.
- A typecheck script (scripts.typecheck), or TypeScript installed locally with a tsconfig.json.

## Outcomes

- **pass**: The file has zero explicit any, no new type-check suppressions, and typecheck passes.
- **partial**: The any count dropped but not to zero, new suppressions were added, or typecheck fails.
- **fail**: The any count did not drop, or the file was deleted.

## How it is verified

- Counts `any` used as a type (after `:`, `<`, `|`, `as`, and similar), ignoring comments, strings, and identifiers like `many` or `obj.any`.
- New `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, or `no-explicit-any` disable comments in the file make the result partial.
- Typechecks with the `typecheck` script, or with the local `tsc --noEmit -p tsconfig.json` when there is no script.
- When a `typecheck` script exists, its exit code is recorded at start and an unchanged failure is not counted against the agent. If baseline scripts were skipped or typechecking uses the local `tsc` fallback, baseline health is unknown.

The prompt and verifier live in [`packages/benchmarks/src/tasks/ts-strict-file`](https://github.com/wemilabs/oh-my-otter/tree/v1-dev/packages/benchmarks/src/tasks/ts-strict-file). Changing either requires a `version` bump in `task.json`.
