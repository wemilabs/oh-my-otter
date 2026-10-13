# Privacy: exactly what `omot report` sends

Oh My Otter collects nothing by default. This page lists the complete contents
of a benchmark report — it is the whole thing.

## Principles

- Scanning (`omot scan`, `omot checks`, `--fix`) and benchmarking
  (`omot bench`) are **100% local**. No network calls, no telemetry, no
  analytics, no update pings.
- Nothing is ever sent unless you run `omot report`, see the exact payload
  printed in your terminal, and confirm. `omot report --dry-run` prints the
  payload and sends nothing.
- The CLI never reads file contents beyond what checks need locally, and never
  includes any of it in a report.

## The complete report payload

This is an example report. Every report has exactly these fields — no more.

```json
{
  "schema_version": 1,
  "cli_version": "0.3.0",
  "scoring_version": 1,
  "task_id": "add-unit-test",
  "task_version": 4,
  "agent": "claude-code",
  "agent_version": "2.1.0",
  "model": "claude-opus-4",
  "outcome": "pass",
  "human_corrections": 1,
  "human_minutes": 12,
  "attempts": 1,
  "readiness_score": 63,
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

- `checks`: built-in check IDs mapped to `pass`/`fail`/`warn`/`na` status only.
  Custom plugin checks are **excluded**.
- `stack`: coarse enums only (package manager: `npm`/`pnpm`/`yarn`/`bun`/
  `other`; language: `typescript`/`javascript`; framework: `nextjs`/`react`/
  `vue`/`svelte`/`astro`/`node`/`other`). No versions.
- `submitted_on`: date only, no time.
- `human_corrections` and `human_minutes`: self-reported integers you enter at
  `omot bench verify`.
- `attempts`: the number of verification attempts recorded for the run.
- `agent`: the coding agent slug from `.omot/run.json` (`[a-z0-9._-]`, at most
  40 characters, `unknown` when not given). Self-reported via
  `omot bench start --agent`.
- `agent_version` (optional): the coding agent's version, a slug of at most 40
  characters from `[a-z0-9._-]`. Self-reported via `--agent-version`.
- `model` (optional): the model the agent used, a lowercase slug of at most 60
  characters from `[a-z0-9._-]`. Self-reported via `--model`.
- `agent`, `agent_version`, and `model` follow the same rules: strict patterns,
  no free text beyond the slug, never prompted for, and omitted (or `unknown`
  for `agent`) when not given. They describe the tool, not the person.

## Never collected or sent

Repo name, remote URL, owner, branch or commit hashes, file names or paths,
file contents, code, dependency names or versions, environment variables,
hostnames, IP-derived data, agent session links, prompts you edited, emails,
or your username.

Your GitHub issue is public under your account, but the stored dataset
line contains only the JSON fields above — your username and the issue's title and
text are stripped by the ingest action and never written. Issues can't be
deleted by their author, so if you want one removed, ask a maintainer to
delete it.

## How it's submitted

1. `omot report` reads `.omot/run.json`, prints the exact JSON payload, and
   asks for confirmation (`--dry-run` prints and exits).
2. On confirmation it opens a prefilled public GitHub issue in your browser —
   nothing is sent until you review it and click **Create**. If the payload is
   too long for a URL, it's copied to your clipboard for you to paste into the
   issue form instead.
3. The `ingest-report` GitHub Action extracts the JSON, validates it against a
   strict schema (unknown fields are rejected) plus the plausibility checks
   below, and appends only the validated fields as one line in
   `reports.ndjson` on the orphan `dataset` branch. It re-checks the issue
   body right before appending (an edited issue is skipped), records the
   stored line verbatim in its comment, then closes and locks the issue.
   The action never writes your username, the issue number, or the issue
   text. Aggregated results are published hourly at
   <https://ohmyotter.vercel.app/results>.

## Plausibility checks

Before a report is stored, the ingest action re-checks it for consistency:

- `task_version` can't be newer than the task version bundled with the
  released omot.
- `readiness_score` must equal the score recomputed from `checks` using the
  built-in check weights (for the current `scoring_version`).
- `cli_version` can't be newer than the latest released omot.
- `submitted_on` can't be more than a day in the future.
- The schema itself already enforces `attempts >= 1` and known check ids.
- At most two other report issues per author per hour / open at once; more
  are declined with a comment.

Self-reports can't be fully authenticated: a determined person can still
fabricate a plausible run. Cells with fewer than five reports stay hidden in
aggregate results, and every report arrives through a public commit on the
`dataset` branch — those are the remaining safeguards.

## Enforcement

- The payload is validated with a strict zod schema at submit time and again
  in the ingest action; unknown fields fail validation.
- A unit test snapshots the payload shape, so adding a field requires a
  deliberate, reviewed change, a `schema_version` bump, and an update to this
  file.

## Website analytics

The website at <https://ohmyotter.vercel.app> (not the CLI) uses Vercel Web
Analytics and Speed Insights. Both are cookieless and collect only aggregated
page-view and performance metrics; no report or dataset contents are sent.
The CLI itself still makes no network calls.
