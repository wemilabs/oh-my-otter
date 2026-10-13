---
title: dep-patch-bump
description: Bump a dependency within its major version.
---

Bump a dependency within its major version. Category: dependencies. Scope: small.

```sh
omot bench start dep-patch-bump --param package=zod --agent <your-agent>
```

## Parameters

| Name      | Kind    | Description                                              | Example |
| --------- | ------- | -------------------------------------------------------- | ------- |
| `package` | package | The dependency to update, as declared in a package.json. | `zod`   |

## Preconditions

- The package is declared in dependencies, devDependencies, or optionalDependencies of a package.json.
- A committed lockfile (pnpm, npm, yarn, or bun).
- Dependencies are installed locally so build and test scripts can run.

## Outcomes

- **pass**: The lockfile changed for the package, its major version (minor for 0.x) is unchanged, no other dependency changed, and the build and test scripts pass.
- **partial**: The package was updated within its major version, but the build or tests fail, or other dependencies changed.
- **fail**: The lockfile was not updated for the package, the package was removed, or its major version changed.

## How it is verified

- Reads every `package.json` that declares the package at start, and records the declared ranges.
- Lockfile: for `package-lock.json`/`npm-shrinkwrap.json`, compares the package's `node_modules/<package>` entries; for pnpm, yarn, and bun text lockfiles, an added diff line must mention the package; a changed `bun.lockb` counts.
- Major version: compares the first number of the declared range before and after (for 0.x, the first two numbers), so `^1.1.0 → ^1.3.0` is fine and `^1.1.0 → ^2.0.0` fails.
- Runs the `build` and `test` scripts with the detected package manager and records their baseline exit codes at start (missing scripts are skipped and reported).
- A script failure that also occurred at baseline is not counted against the agent and includes the output tail. If baseline scripts were skipped or that script did not exist at start, a later failure is counted and reported with unknown baseline health.

The prompt and verifier live in [`packages/benchmarks/src/tasks/dep-patch-bump`](https://github.com/wemilabs/oh-my-otter/tree/v1-dev/packages/benchmarks/src/tasks/dep-patch-bump). Changing either requires a `version` bump in `task.json`.
