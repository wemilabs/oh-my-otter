# Oh My Otter: Build Plan

Implementation plan for coding agent · October 10, 2026

## 1. What we are building

**Oh My Otter** is an open-source benchmark and optimization toolkit for seamless Devin integration.

It has three parts:

- **CLI (`omot`)**: scans a local repo, outputs a readiness score with fixable findings, and has a plugin interface for checks.
- **Benchmark tasks**: a small set of standardized, objectively verifiable JavaScript/TypeScript dev tasks (web first) people run against Devin.
- **Website (Next.js)**: docs, check catalog, benchmark catalog, methodology, and public aggregate results.

The project is **unofficial and independent**. It is not affiliated with or endorsed by Cognition. Say this in the README, website footer, and CLI `--help`.

**Non-goals:** no hosted scanning, no code upload, no accounts, no dependence on Devin's API.

## 2. Tech decisions (fixed)

- Language: TypeScript everywhere, Node 22.12+.
- Monorepo: pnpm workspaces + Turborepo.
- CLI: `commander`, `picocolors`, `zod`, `execa`, `fast-glob`. Bundle with `tsup`. Test with `vitest`.
- Website: Next.js (App Router), TypeScript, Tailwind CSS/shadcn ui, fully static export where possible, deployed on Vercel. Docs with Fumadocs, which pairs well with Next.js.
- Data: plain JSON files in the repo (`dataset/`). No database in the MVP.
- License: MIT.

## 3. Repository layout

```text
oh-my-otter/
  packages/
    core/         # types, scoring, check runner, zod schemas (shared by CLI and site)
    checks/       # built-in checks, one file per check
    benchmarks/   # task templates and verifiers
    cli/          # the `omot` binary
  apps/
    web/          # Next.js site
  dataset/
    reports/      # one JSON file per accepted report (validated)
  docs/           # methodology, privacy, contributing
  .github/
    workflows/    # ci, release, ingest-report
    ISSUE_TEMPLATE/
  CONTRIBUTING.md  PRIVACY.md  LICENSE  README.md
```

## 4. Phase 1: Core and scanner CLI

### 4.1 Check interface (`packages/core`)

```typescript
export type CheckStatus = "pass" | "fail" | "warn" | "na";

export interface CheckResult {
  status: CheckStatus;
  detail?: string;        // short, human-readable, shown in terminal only
  fix?: string;           // suggested fix text
}

export interface CheckContext {
  root: string;                                  // absolute repo path
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string | null>;     // null if missing; read-only
  glob(pattern: string): Promise<string[]>;
  packageJson: Record<string, unknown> | null;
  run(cmd: string, opts?: { timeoutMs?: number }): Promise<{ code: number }>; // only used when --run is passed
}

export interface Check {
  id: string;             // kebab-case, stable, e.g. "test-script"
  title: string;
  category: "setup" | "verification" | "docs" | "hygiene";
  weight: number;         // 1 to 5
  why: string;            // one sentence on why an agent needs this
  run(ctx: CheckContext): Promise<CheckResult>;
  fix?(ctx: CheckContext): Promise<FixPlan>;  // optional, powers --fix
}
```

A `FixPlan` is a list of files to create (never overwrite) with their contents.

### 4.2 Scoring

- Score = 100 × (sum of weights of passing checks) ÷ (sum of weights of all non-`na` checks), rounded.
- `warn` counts as half weight.
- Grades: 90 and above = A, 75 to 89 = B, 60 to 74 = C, below 60 = D.
- Scoring lives in `core` with unit tests. The algorithm is documented on the methodology page and versioned (`scoring_version: 1`).

### 4.3 Built-in checks (ship these 14)

- `package-manager-lockfile` (5): a lockfile exists and matches the declared package manager.
- `node-version-pinned` (3): `.nvmrc`, `.node-version`, or `engines.node`.
- `install-documented` (4): README has an install/setup section with a runnable command.
- `test-script` (5): `scripts.test` exists.
- `tests-exist` (4): at least one test file matches common patterns.
- `tests-pass` (5): the test script exits 0. Only runs with `--run`; otherwise `na`.
- `lint-script` (3): `scripts.lint` exists.
- `typecheck-script` (3): `scripts.typecheck`, or `tsc --noEmit` in scripts, or `na` for non-TypeScript repos.
- `build-script` (4): `scripts.build` exists.
- `ci-config` (3): `.github/workflows/*` or another known CI config.
- `env-example` (3): `.env.example` or equivalent if any `process.env` or `import.meta.env` usage is found.
- `formatter-config` (2): Prettier, Biome, or equivalent.
- `contributing-or-agents-doc` (2): `CONTRIBUTING.md`, `AGENTS.md`, or similar conventions doc.
- `gitignore-sane` (2): `.gitignore` exists and ignores `node_modules` and build output.

### 4.4 CLI commands (Phase 1)

- `omot scan [path]`: scan and print the report (default command, so plain `omot` runs it). Flags: `--run` (execute test/build scripts for the deeper checks), `--json` (machine-readable output), `--fix` (apply fix plans for failing checks, create-only, shows a diff and asks to confirm), `--badge` (print a README badge snippet), `--plugin <path|package>` (load extra checks).
- `omot init [path]`: hidden alias of `scan` kept for backward compatibility, same flags. Commander's `.alias()` shows aliases in help, so register `init` as a separate command with `{ hidden: true }` that reuses the `scan` options and action. Register `scan` with `{ isDefault: true }`.
- `omot checks`: list all loaded checks with weights.
- Exit code is always 0 unless the tool itself errors. A `--min-score <n>` flag exits 1 below the threshold, for CI use.
- **The scanner makes zero network calls.** Enforce with a test that fails if `fetch`, `http`, or `https` is invoked during a scan.

### 4.5 Plugin loading

A plugin is an ES module whose default export is `Check[]`. Load via `--plugin` or an `omot.config.ts` in the repo root (`{ plugins: [...] }`). Load `.ts` configs and plugins with `jiti`, and also accept `.js` and `.mjs`. Validate every loaded check against a zod schema and refuse malformed ones with a clear error. Document in `docs/writing-a-check.md` with a template.

### 4.6 Badge

No server. `--badge` prints a Markdown snippet using a static shields.io URL, for example `![agent-ready](https://img.shields.io/badge/agent--ready-82%20%C2%B7%20B-green)`. Color by grade.

### 4.7 Phase 1 acceptance criteria

- `npx oh-my-otter scan` on three fixture repos (healthy, bare, monorepo) returns expected scores in tests.
- `--fix` never overwrites an existing file.
- Adding a new check requires only one new file plus one registry line.
- CI green on Linux, macOS, and Windows runners.

## 5. Phase 2: Benchmark tasks

Goal: standardized tasks with **objective, locally computed** outcomes, so results are comparable.

### 5.1 Task template format (`packages/benchmarks`)

Each task is a folder with `task.json` (zod-validated), `prompt.md`, and a `verify.ts`.

- `id`, `version`, `title`, `category`, `estimatedScope` (small/medium)
- `prompt`: the exact text users paste to Devin. The prompt is fixed per version.
- `preconditions`: what the repo must have (for example, a test runner for the add-test task).
- `verify`: a function returning `{ outcome: "pass" | "partial" | "fail", reasons: string[] }`, computed from the repo state using commands run locally.

### 5.2 Initial six tasks

- `dep-patch-bump`: bump one named patch/minor dependency; pass if lockfile updated, build and tests pass.
- `add-unit-test`: add tests for one named untested function; pass if new tests exist, pass, and no source files changed.
- `fix-lint-rule`: eliminate all violations of one named ESLint rule; pass if lint shows zero for that rule and tests still pass.
- `a11y-img-alt`: add missing `alt` attributes in a named directory; pass if a static check finds none missing and build passes.
- `ts-strict-file`: remove `any` from one named file; pass if typecheck passes and `any` count in the file is zero.
- `fix-failing-test`: fix a deliberately failing test (the CLI provides a patch to introduce the failure on a throwaway branch); pass if the suite is green and the test file is not deleted or skipped.

Tasks that need parameters (a named dependency, function, or file) take them via `--param key=value` so the prompt is still template-fixed.

### 5.3 CLI commands (Phase 2)

- `omot bench list` and `bench show <id>`: print task details and the exact prompt.
- `omot bench start <id> [--param ...]`: records the local baseline (current commit hash, start time) to `.omot/run.json`, then prints the prompt.
- `omot bench verify`: after the user has pulled or merged Devin's changes, runs the verifier, then asks the user for two self-reported numbers (human corrections, 0 to N; minutes of human effort) and writes the result to `.omot/run.json`.
- Add `.omot/` to `.gitignore` automatically (create-only rule applies, append-only for this line, with confirmation).

### 5.4 Acceptance criteria

- Each verifier has tests against pass, partial, and fail fixture repos.
- A task `version` bump is required for any prompt or verifier change (enforced by a CI check comparing against main).

## 6. Phase 3: Reporting and dataset

### 6.1 Submission mechanism (no backend)

For the MVP, reports are submitted through a **public GitHub issue**, so there is no server, no database, and no secrets, and the user sees everything.

- `omot report` reads `.omot/run.json`, builds the payload, **prints the exact JSON**, and asks for explicit confirmation (`y/N`). `--dry-run` prints and exits.
- On confirmation, it opens the browser to a prefilled new-issue URL using the `report` issue template with the JSON in the body. If the payload is too long for a URL, it copies the JSON to the clipboard and instructs the user to paste it.
- The `ingest-report` GitHub Action triggers on issues labeled `report`: it extracts the JSON, validates it with the shared zod schema (strict, no extra fields allowed), rejects with a comment if invalid, otherwise commits `dataset/reports/<timestamp>-<random>.json` and closes the issue. **The committed file does not include the submitter's username.**
- Basic abuse control: one report per issue, schema-strict, maintainers can delete bad files, and a `dataset/blocklist` of issue authors is optional later.

### 6.2 Aggregation

The website computes aggregates **at build time** from `dataset/reports/*.json`: success rate per task, success rate by readiness band (A/B/C/D), median human corrections, and sample sizes. Never display a percentage without its sample size `n`. Hide any cell with fewer than 5 reports and show "not enough data yet".

### 6.3 Acceptance criteria

- A malformed payload is rejected by the Action with a helpful comment.
- A valid payload results in exactly one new dataset file and a rebuilt site.
- The dataset is downloadable as raw JSON from the repo and from `/results/data.json`.

## 7. Privacy: exactly what is sent

### 7.1 Principles

- Scanning (`scan`, `checks`, `--fix`) is **100% local**. No network calls, no telemetry, no analytics, no update pings.
- Nothing is ever sent unless the user runs `omot report`, sees the full payload, and confirms.
- The CLI never reads file contents beyond what checks need locally, and never includes any of it in a report.

### 7.2 The complete report payload (this is the whole thing)

```json
{
  "schema_version": 1,
  "cli_version": "0.3.0",
  "scoring_version": 1,
  "task_id": "add-unit-test",
  "task_version": 1,
  "outcome": "pass",
  "human_corrections": 1,
  "human_minutes": 12,
  "readiness_score": 82,
  "checks": {
    "test-script": "pass",
    "lint-script": "fail",
    "tests-pass": "na"
  },
  "stack": {
    "package_manager": "pnpm",
    "language": "typescript",
    "framework": "nextjs"
  },
  "submitted_on": "2026-10-10"
}
```

Field rules:

- `checks`: built-in check IDs mapped to status only. Custom plugin checks are **excluded**.
- `stack`: coarse enums only (package manager: npm/pnpm/yarn/bun/other; language: typescript/javascript; framework: nextjs/react/vue/svelte/astro/node/other). No versions.
- `submitted_on`: date only, no time.
- `human_corrections` and `human_minutes` are self-reported integers.

### 7.3 Never collected or sent

Repo name, remote URL, owner, branch or commit hashes, file names or paths, file contents, code, dependency names or versions, environment variables, hostnames, IP-derived data, Devin session links, prompts you edited, emails, or your username (the GitHub issue is public under your account, but the stored dataset file strips it, and you can delete the issue).

### 7.4 Enforcement

- The payload zod schema is `.strict()`. Unknown fields throw.
- A unit test snapshots the payload shape so any new field requires a deliberate, reviewed change plus a `schema_version` bump and a `PRIVACY.md` update.
- `PRIVACY.md` and `/privacy` render from the same source and list the exact JSON above.

## 8. Website (Next.js, `apps/web`)

### 8.1 Setup steps

1. Scaffold with `create-next-app` (App Router, TypeScript, Tailwind/shadcn ui, ESLint) inside `apps/web`; wire it to the workspace.
2. Import `@oh-my-otter/core`, `@oh-my-otter/checks`, and `@oh-my-otter/benchmarks` so the site renders from the same source of truth as the CLI.
3. Create a build-time data loader that reads `dataset/reports/*.json`, validates each with the shared schema (skip and log invalid files), and exposes aggregates.
4. Use static generation for all pages (`generateStaticParams` for dynamic routes). Add on-push rebuild on Vercel.
5. Add an OG image, sitemap, robots, and a dark/light theme.

### 8.2 Pages

- `/`: hero, one-line pitch, `npx oh-my-otter scan` copy button, sample report screenshot, links to GitHub, and the unofficial disclaimer.
- `/docs`: install, usage, flags, `--fix`, plugins, CI usage (`--min-score`).
- `/checks` and `/checks/[id]`: catalog with search and category filter; each page shows title, weight, why it matters, how to pass, and fix suggestion. Client-side search with `fuse.js`.
- `/benchmarks` and `/benchmarks/[id]`: task catalog; each page shows the exact prompt, preconditions, and pass criteria, plus that task's aggregate results.
- `/results`: aggregate tables and simple bar charts (`recharts`); success rate by readiness band and by task; always show `n`; low-sample cells suppressed; link to raw JSON; banner explaining data is self-reported.
- `/methodology`: scoring formula, check weights, task design, verification, self-report limits, known biases.
- `/privacy`: the exact payload and the never-collected list.
- `/contribute`: how to add a check, a benchmark task, or submit a report.

### 8.3 Acceptance criteria

- Lighthouse 95 and above on performance, accessibility, and SEO on `/` and `/checks`.
- No third-party analytics scripts or cookies. If analytics are wanted later, use a cookieless privacy-first option and document it on `/privacy`.
- Site builds with an empty dataset and shows "no reports yet" states.

## 9. Quality, CI, and release

- **CI (every PR):** install, typecheck, lint, vitest, build all packages, build the site, run schema and snapshot privacy tests, verify unique check IDs, and verify task version bumps.
- **Release:** Changesets for versioning; GitHub Action publishes `oh-my-otter` (CLI) and scoped packages to npm with provenance on tag.
- **Docs gate:** every new check or task must include its documentation file or CI fails.

## 10. Open-source setup

- Files: `README.md` (pitch, quickstart, disclaimer, badge), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `PRIVACY.md`, MIT `LICENSE`.
- Issue templates: bug, new check proposal, new benchmark task proposal, report submission.
- PR template with a checklist (tests, docs, weight rationale for new checks).
- Seed 5 issues labeled `good first check`.

## 11. Build order for the coding agent

Complete each step and its tests before moving on.

1. Initialize the monorepo (pnpm, Turborepo, tsconfig base, ESLint, Prettier, vitest, Changesets, CI skeleton).
2. Build `core`: types, zod schemas, scoring with tests.
3. Build the check runner and `CheckContext` implementation (read-only fs, glob, optional `run`).
4. Implement the 14 built-in checks with fixture repos and tests.
5. Build the CLI: `scan` (default, plus hidden `init` alias), `checks`, `--json`, `--min-score`, `--badge`, then `--fix` and `--plugin`/config loading. Add the no-network test.
6. Checkpoint: Phase 1 acceptance criteria met; publish `0.1.0`.
7. Build `benchmarks`: schema, six tasks, verifiers with fixture tests.
8. Add `bench list/show/start/verify` and the `.omot/` handling.
9. Build the report payload schema (strict), snapshot test, and `report` command with preview, confirmation, and `--dry-run`.
10. Add the issue template and `ingest-report` Action; test with sample issues.
11. Build the website: setup, data loader, then pages in this order: `/`, `/docs`, `/checks`, `/benchmarks`, `/methodology`, `/privacy`, `/contribute`, `/results`.
12. Write the open-source files, docs, and seed issues; run the full acceptance checklists; publish `0.2.0` and deploy the site.

## 12. Risks and mitigations

- **Noisy self-reported data:** fixed prompts, objective local verification, sample sizes always shown, small cells suppressed, limitations stated on `/methodology`.
- **Claims outrunning evidence:** do not claim that readiness causes better outcomes until the dataset supports it; use "observed in submitted reports" wording.
- **Trademark confusion:** the unofficial disclaimer everywhere; avoid Devin logos.
- **Spam or poisoned reports:** strict schema, issue-based review trail, maintainers can remove files; rate limiting by GitHub itself.
- **Scope creep:** anything outside this plan (hosted features, accounts, Devin API integration) goes to a post-MVP backlog.

## 13. Future scope: mobile

React Native and Expo are the first planned extension, since they live in the same `package.json` world. Until then, those repos can be scanned, but they report as framework `other` and the benchmark tasks are not mobile-aware.

- Add `react-native` and `expo` to the framework enum (bump `schema_version` and update `PRIVACY.md`).
- Add a couple of checks, for example Metro/Expo config present.
- Add one or two mobile-specific benchmark tasks with verifiers.
- Native iOS (Swift) and Android (Kotlin) stay out of scope until they get their own check set and verifiers.

## 14. Future scope: model comparison

Devin lets users choose the underlying model, so reports could show how Devin performs with each one. According to [Devin's CLI docs](https://docs.devin.ai/cli/models), the CLI offers model families such as `opus`, `sonnet`, `swe`, `codex`, and `gemini`, plus an Adaptive router that picks a model per task.

- Add an optional `model` field to the report payload, as a coarse enum (`adaptive`, `opus`, `sonnet`, `swe`, `codex`, `gemini`, `other`). Keep it self-reported unless the Devin API turns out to expose the model used; check this first, along with whether cloud sessions expose it at all.
- Bump `schema_version`, and update `PRIVACY.md` and the `/privacy` page. The snapshot test forces this.
- On `/results`, add success rate by model and by readiness band, with the same rule of at least 5 reports per cell. Splitting by model makes samples thin, so expect many empty cells at first.
- State the limits on `/methodology`: short names resolve to the latest version in a family, so the report date matters; Adaptive is a router, not a model, so it stays its own category; and people tend to pick models by task difficulty, which biases comparisons.
