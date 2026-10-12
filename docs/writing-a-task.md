# Writing a benchmark task

A task is one folder plus one registry line, like a check.

1. Create `packages/benchmarks/src/tasks/<id>/` with:
   - `task.json`: validated by `taskManifestSchema` (`id`, `version`, `title`, `category`, `estimatedScope`, `params`, `preconditions`, and `criteria.pass/partial/fail`).
   - `prompt.md`: the fixed prompt users paste into their coding agent. Use `{{param}}` placeholders only for declared params. Keep it agent-neutral; never name a vendor.
   - `verify.ts`: `export default defineTask({ manifest, prompt, prepare?, verify })`. `prepare` runs at `omot bench start`, checks preconditions (throw `TaskPreconditionError`), and returns JSON data saved as the baseline. `verify` returns `{ outcome: "pass" | "partial" | "fail", reasons: string[] }`.
2. Add one line to `packages/benchmarks/src/registry.ts`.
3. Add `docs/benchmarks/<id>.md` (CI fails without it).
4. Add pass, partial, and fail tests in `packages/benchmarks/test/<id>.test.ts` using the `startTask`/`verifyTask` helpers, which build throwaway git repos.

Verifiers use the context: `changedFiles()` (working tree versus the baseline commit, excluding `.omot/`), `read`/`readBaseline`, `runScript(name)` with the detected package manager, and `runPackageBin(pkg, args)` for locally installed tools. They must not make network calls or modify the repository.

Any change to `prompt.md` or `verify.ts` of an existing task needs a `version` bump in `task.json`, so results from different versions are never mixed. CI checks this with `packages/benchmarks/scripts/check-task-versions.mjs`.
