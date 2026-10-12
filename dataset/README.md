# Dataset

Public benchmark reports submitted with `omot report`, plus the canonical
agent list used to aggregate them.

## `reports/`

One JSON file per submitted benchmark report. Each file contains exactly the
validated report payload described in [PRIVACY.md](../PRIVACY.md) — no
usernames, issue numbers, repo names, paths, or code. Reports are added by the
`ingest-report` GitHub Action, which validates the payload strictly and stores
only the JSON fields. Maintainers may delete report files that are abusive or
malformed.

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

Adding an agent is one PR that edits this file; no report files are rewritten.
