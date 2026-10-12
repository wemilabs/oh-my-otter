# Dataset

Public benchmark reports submitted with `omot report`, plus the canonical
agent list used to aggregate them.

## `reports.ndjson`

Reports live in a single append-only `reports.ndjson` file on the orphan
`dataset` branch — one validated payload per line, in the field order shown
in [PRIVACY.md](../PRIVACY.md). No usernames, issue numbers, repo names,
paths, or code.

Raw URL:
`https://raw.githubusercontent.com/wemilabs/oh-my-otter/dataset/reports.ndjson`

Reports are added by the `ingest-report` GitHub Action: it validates the
payload strictly, runs the plausibility checks described in PRIVACY.md, and
appends one line to `reports.ndjson` on the `dataset` branch. Maintainers
may remove lines that are abusive or malformed.

Rate limits: an author with three or more report issues in the last hour, or
three or more open report issues, is declined until they wait or close them.

## `agents.json`

Maps the self-reported `agent` slug in each report to a canonical agent:

```json
{ "id": "claude-code", "display_name": "Claude Code", "aliases": ["claude"] }
```

- `id`: canonical slug (`[a-z0-9._-]`, at most 40 characters).
- `display_name`: human-readable name.
- `aliases`: other self-reported slugs that mean the same agent.

Ids and aliases must be unique across the whole file, and `other`/`unknown`
are reserved: any report whose `agent` matches nothing — including `unknown` —
counts as `other`, which is shown but never ranked.

`agents.json` stays on `main` as code. Adding an agent is one PR that edits
this file; no report lines are rewritten.
