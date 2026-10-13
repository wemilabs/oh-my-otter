# Oh My Otter: Build Plan

Implementation plan for coding agent · October 10, 2026

## 1. What we are building

**Oh My Otter** is an open-source benchmark and optimization toolkit for AI coding agents (for example Devin, Claude Code, Cursor, Codex, and Copilot). It is agent-neutral: any coding agent can be scanned for and benchmarked.

It has three parts:

- **CLI (`omot`)**: scans a local repo, outputs a readiness score with fixable findings, and has a plugin interface for checks.
- **Benchmark tasks**: a small set of standardized, objectively verifiable JavaScript/TypeScript dev tasks (web first) people run against any AI coding agent.
- **Website (Next.js)**: docs, check catalog, benchmark catalog, methodology, and public aggregate results.

The project is **unofficial and independent; not affiliated with or endorsed by Cognition or any other agent vendor**. Say this in the README, website footer, and CLI `--help`.

**Non-goals:** no hosted scanning, no code upload, no accounts, no dependence on any agent vendor's API.

## 2. Tech decisions (fixed)

- Language: TypeScript everywhere, Node 22.13+.
- Monorepo: pnpm workspaces + Turborepo.
- CLI: `commander`, `picocolors`, `zod`, `execa`, `tinyglobby`, `clipboardy` (clipboard fallback for `omot report`). Bundle with `tsup`. Test with `vitest`.
- Website: Next.js (App Router), TypeScript, Tailwind CSS/shadcn ui, statically generated (SSG, not `output: 'export'`; see 8.1), deployed on Vercel. Docs with Fumadocs, which pairs well with Next.js.
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
    agents.json   # canonical agent list (reports.ndjson lives on the `dataset` branch)
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

export interface FixPlan {
  files: Array<{
    path: string;         // repo-relative; created only if it does not exist
    contents: string;     // full file contents to write
  }>;
}
```

A `FixPlan` is a list of files to create (never overwrite) with their contents. It is create-only: the `--fix` applier skips any `path` that already exists and reports it as skipped, and a `FixPlan` has no way to express edits, appends, or deletions.

### 4.2 Scoring

- Score = 100 × (sum of earned weight) ÷ (sum of possible weight), where each non-`na` check contributes:
  - `pass`: its full weight to both the numerator and the denominator.
  - `warn`: half its weight to **both** the numerator and the denominator.
  - `fail`: 0 to the numerator and its full weight to the denominator.
  - `na`: nothing to either.
- If the denominator is 0 (every check is `na`), the score is 100.
- The raw percentage is rounded with `Math.round` (round half up, so 89.5 becomes 90) to an integer from 0 to 100. The grade is computed from this rounded integer, never from the raw value.
- Grades (on the rounded integer score): A = 90 to 100, B = 75 to 89, C = 60 to 74, D = 0 to 59.
- Scoring lives in `core` with unit tests. The tests must include explicit cases for `warn` half-weighting (numerator and denominator), and for each grade boundary: 89/90 (B/A), 74/75 (C/B), and 59/60 (D/C), including a raw value that rounds across a boundary. The algorithm is documented on the methodology page and versioned (`scoring_version: 1`).

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
- **The scanner makes zero network calls.** Enforce with a vitest test that runs a full scan of a fixture repo with all network entry points stubbed to throw: replace `globalThis.fetch`, and `vi.mock` `node:http`, `node:https` (`request`, `get`, `Agent`), and `node:net` (`connect`, `createConnection`, `Socket.prototype.connect`). Any attempted call throws, and the test also asserts the stubs were called zero times, so a swallowed error still fails the test.

### 4.5 Plugin loading

A plugin is an ES module whose default export is `Check[]`. Load via `--plugin` or an `omot.config.ts` in the repo root (`{ plugins: [...] }`). Load `.ts` configs and plugins with `jiti`, and also accept `.js` and `.mjs`. Validate every loaded check against a zod schema and refuse malformed ones with a clear error. Document in `docs/writing-a-check.md` with a template.

**Execution safety:** loading `omot.config.ts` or a `--plugin` module through `jiti` executes arbitrary local code with the user's privileges, at the same trust level as running a local build script. The zod validation checks shape only, not safety, and it runs after the module's code has already executed. Plugins are not sandboxed, and the no-network guarantee covers built-in checks only. `docs/writing-a-check.md` and the `/docs` plugins section must warn users to only load plugins and configs they trust, the same as any dependency they install.

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
- `prompt`: the exact text users paste into their coding agent. The prompt is fixed per version.
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
- `omot bench start <id> [--param ...]`: records the local baseline (current commit hash, start time) to `.omot/run.json`, then prints the prompt. `--agent <name>` records which coding agent is being benchmarked as an optional `agent` field (a lowercase slug of at most 40 characters from `[a-z0-9._-]`, default `"unknown"`); `verify` can override it. It is never prompted for.
- `omot bench verify`: after the user has pulled or merged the agent's changes, runs the verifier, then asks the user for two self-reported numbers (human corrections, 0 to N; minutes of human effort) and writes the result to `.omot/run.json`.
- Add `.omot/` to `.gitignore` automatically (create-only rule applies, append-only for this line, with confirmation).

### 5.4 Acceptance criteria

- Each verifier has tests against pass, partial, and fail fixture repos.
- A task `version` bump is required for any prompt or verifier change (enforced by a CI check comparing against the PR's base branch, `main` by default).

## 6. Phase 3: Reporting and dataset

### 6.1 Submission mechanism (no backend)

For the MVP, reports are submitted through a **public GitHub issue**, so there is no server, no database, and no secrets, and the user sees everything.

- `omot report` reads `.omot/run.json`, builds the payload, **prints the exact JSON**, and asks for explicit confirmation (`y/N`). `--dry-run` prints and exits.
- On confirmation, it opens the browser to a prefilled new-issue URL using the `report` issue template with the JSON in the body. If the payload is too long for a URL, it copies the JSON to the clipboard with `clipboardy` and instructs the user to paste it. If clipboard access fails (for example, a headless session), it prints the JSON and tells the user to copy it manually.
- The `ingest-report` GitHub Action triggers on issues labeled `report`: it extracts the JSON, validates it with the shared zod schema (strict, no extra fields allowed) plus plausibility checks, rejects with a comment if invalid, otherwise appends one line to `reports.ndjson` on the orphan `dataset` branch and closes the issue. **The appended line does not include the submitter's username.** The Action builds the line only from the validated payload fields, never from issue metadata (author, issue number, URLs).
- Basic abuse control: one report per issue, schema-strict, rate-limited per author (at most two other report issues in the last hour or open at once), maintainers can remove bad lines.

### 6.2 Aggregation

The website computes aggregates **at request time** from `reports.ndjson` on the `dataset` branch, fetched with ISR (revalidated hourly): success rate per task, success rate by readiness band (A/B/C/D), median human corrections, and sample sizes. Never display a percentage without its sample size `n`. Hide any cell with fewer than 5 reports and show "not enough data yet".

**Agent-neutral results.** `agent` is self-reported free text (normalized to a slug), so aggregation maps it to a canonical allowlist kept in the repo, `dataset/agents.json`. Each entry has an `id`, a `display_name`, and `aliases`, for example `{ "id": "claude-code", "display_name": "Claude Code", "aliases": ["claude", "claude-cli"] }`. A report whose `agent` matches an `id` or an alias counts toward that agent. Anything else, including `unknown`, is grouped as `other`, which is shown but never ranked. Adding an agent means one PR to `dataset/agents.json`, and no report files are rewritten.

- Per task and per canonical agent: pass/partial/fail rates, median human corrections, and median human minutes, always shown with the report count `n`.
- Agents with fewer than 5 reports for a task are marked "insufficient data" and are not ranked. Ranking is by pass rate among agents that meet the minimum `n`.
- `agent_version` and `model` are optional dimensions on top of `agent`; the same minimum-`n` rule applies to every cell.
- Results are self-reported, not verified: the verifier ran locally on the submitter's machine, and the agent, version, model, corrections, and minutes are the submitter's own claims.

### 6.3 Acceptance criteria

- A malformed payload is rejected by the Action with a helpful comment.
- A valid payload results in exactly one new line in `reports.ndjson` and a site that picks it up within an hour.
- A test runs the ingest logic on a sample issue from a known author and asserts the appended line never contains the submitter's GitHub username/handle (case-insensitive substring search over the whole file), including when the handle also appears in the issue title or body. This is in addition to the strict schema validation.
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
  "agent": "claude-code",
  "agent_version": "2.1.0",
  "model": "claude-opus-4",
  "outcome": "pass",
  "human_corrections": 1,
  "human_minutes": 12,
  "attempts": 1,
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
- `attempts`: integer verification-attempt count for this run.
- `agent` (planned for Phase 3): the coding agent slug from `.omot/run.json` (`[a-z0-9._-]`, at most 40 characters, default `"unknown"`). Self-reported via `omot bench start --agent`.
- `agent_version` (planned for Phase 3, optional): the agent's version, a slug of at most 40 characters from `[a-z0-9._-]`. Self-reported via `--agent-version`.
- `model` (planned for Phase 3, optional): the model the agent used, a lowercase slug of at most 60 characters from `[a-z0-9._-]`. Self-reported via `--model`.
- `agent`, `agent_version`, and `model` follow the same validation and privacy rules: strict zod regexes, no free text beyond the slug, never prompted for, and omitted (or `unknown` for `agent`) when not given. They describe the tool, not the person.

### 7.3 Never collected or sent

Repo name, remote URL, owner, branch or commit hashes, file names or paths, file contents, code, dependency names or versions, environment variables, hostnames, IP-derived data, agent session links, prompts you edited, emails, or your username (the GitHub issue is public under your account, but the stored dataset file strips it, and you can delete the issue).

### 7.4 Enforcement

- The payload zod schema is `.strict()`. Unknown fields throw.
- A unit test snapshots the payload shape so any new field requires a deliberate, reviewed change plus a `schema_version` bump and a `PRIVACY.md` update.
- `PRIVACY.md` and `/privacy` render from the same source and list the exact JSON above.

## 8. Website (Next.js, `apps/web`)

### 8.1 Setup steps

1. Scaffold with `create-next-app` (App Router, TypeScript, Tailwind/shadcn ui, ESLint) inside `apps/web`; wire it to the workspace.
2. Import `@oh-my-otter/core`, `@oh-my-otter/checks`, and `@oh-my-otter/benchmarks` so the site renders from the same source of truth as the CLI.
3. Create a build-time data loader that reads `dataset/reports/*.json`, validates each with the shared schema (skip and log invalid files), and exposes aggregates.
4. Use static generation for all pages (`generateStaticParams` for dynamic routes), deployed on Vercel **without** `output: 'export'`. A true static export conflicts with runtime OG image generation (`opengraph-image`/`ImageResponse`), the `sitemap.ts`/`robots.ts` metadata routes, and some dynamic-route features, so SSG on Vercel is the default. Pre-generating OG images at build time for a true static export is the fallback only if the site ever has to leave Vercel. Add on-push rebuild on Vercel.
5. Add an OG image, sitemap, robots, and a dark/light theme.

### 8.2 Pages

- `/`: hero, one-line pitch, `npx oh-my-otter scan` copy button, sample report screenshot, links to GitHub, and the unofficial disclaimer.
- `/docs`: install, usage, flags, `--fix`, plugins, CI usage (`--min-score`).
- `/checks` and `/checks/[id]`: catalog with search and category filter; each page shows title, weight, why it matters, how to pass, and fix suggestion. Client-side search with `fuse.js`.
- `/benchmarks` and `/benchmarks/[id]`: task catalog; each page shows the exact prompt, preconditions, and pass criteria, plus that task's aggregate results.
- `/results`: aggregate tables and simple bar charts (`recharts`); success rate by readiness band and by task; per-task, per-agent pass/partial/fail rates with median human corrections and minutes (agents canonicalized via `dataset/agents.json` per §6.2, unknown agents grouped as `other` and not ranked, agents under 5 reports marked "insufficient data"); show attempts per run; filter or group by `agent_version` and `model`; always show `n`; low-sample cells suppressed; link to raw JSON; banner explaining data is self-reported.
- `/methodology`: scoring formula, check weights, task design, verification, self-report limits, known biases.
- `/privacy`: the exact payload and the never-collected list.
- `/contribute`: how to add a check, a benchmark task, or submit a report.

### 8.3 Acceptance criteria

- Lighthouse 95 and above on performance, accessibility, and SEO on `/` and `/checks`.
- No third-party analytics scripts or cookies. If analytics are wanted later, use a cookieless privacy-first option and document it on `/privacy`.
- Site builds with an empty dataset and shows "no reports yet" states.
- `next.config` does not set `output: 'export'`; every page is prerendered at build time (no route is dynamically server-rendered), and the OG image, `/sitemap.xml`, and `/robots.txt` are served correctly on the Vercel deployment.

## 9. Quality, CI, and release

- **CI (every PR):** install, typecheck, lint, vitest, build all packages, build the site, run schema and snapshot privacy tests, verify unique check IDs, and verify task version bumps.
- **Release:** Changesets for versioning; the GitHub Action publishes `oh-my-otter` (CLI) and scoped packages to npm via Trusted Publishing (OIDC), with provenance attached by pnpm.
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
- **Trademark confusion:** the unofficial disclaimer everywhere; avoid agent vendors' logos.
- **Spam or poisoned reports:** strict schema, issue-based review trail, maintainers can remove files; rate limiting by GitHub itself.
- **Scope creep:** anything outside this plan (hosted features, accounts, agent vendor API integrations) goes to a post-MVP backlog.

## 13. Future scope: mobile

React Native and Expo are the first planned extension, since they live in the same `package.json` world. Until then, those repos can be scanned, but they report as framework `other` and the benchmark tasks are not mobile-aware.

- Add `react-native` and `expo` to the framework enum (bump `schema_version` and update `PRIVACY.md`).
- Add a couple of checks, for example Metro/Expo config present.
- Add one or two mobile-specific benchmark tasks with verifiers.
- Native iOS (Swift) and Android (Kotlin) stay out of scope until they get their own check set and verifiers.

## 14. Future scope: model comparison

Many coding agents let users choose the underlying model, so reports could show how each agent performs with each one. For example, Devin lets users choose the model. According to [Devin's CLI docs](https://docs.devin.ai/cli/models), the CLI offers model families such as `opus`, `sonnet`, `swe`, `codex`, and `gemini`, plus an Adaptive router that picks a model per task.

- Build on the optional `model` and `agent_version` payload fields from §7.2 (already captured locally in `.omot/run.json` since Phase 2). For comparison, map the `model` slug to coarse families (`adaptive`, `opus`, `sonnet`, `swe`, `codex`, `gemini`, `other`) in an allowlist like `dataset/agents.json`. Keep it self-reported unless an agent's API turns out to expose the model used; check this first, along with whether cloud sessions expose it at all.
- Bump `schema_version`, and update `PRIVACY.md` and the `/privacy` page. The snapshot test forces this.
- On `/results`, add success rate by model and by readiness band, with the same rule of at least 5 reports per cell. Splitting by model makes samples thin, so expect many empty cells at first.
- State the limits on `/methodology`: short names resolve to the latest version in a family, so the report date matters; Adaptive is a router, not a model, so it stays its own category; and people tend to pick models by task difficulty, which biases comparisons.
