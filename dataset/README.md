# Dataset

Public benchmark reports submitted with `omot report`, plus the canonical
agent list used to aggregate them.

## `reports/`

One JSON file per submitted benchmark report. Each file contains exactly the
validated report payload described in [PRIVACY.md](../PRIVACY.md) — no
usernames, issue numbers, repo names, paths, or code. Reports are added by the
`ingest-report` GitHub Action: it validates the payload strictly, runs the
plausibility checks described in [PRIVACY.md](../PRIVACY.md), and opens one
pull request per report containing only the JSON fields. A maintainer reviews
the JSON-only diff and merges it. Maintainers may delete report files that
are abusive or malformed.

Rate limits: an author with three or more report issues in the last hour, or
three or more open report issues, is declined until they wait or close them.

Pull requests opened with `GITHUB_TOKEN` don't trigger CI, so the dataset PRs
are reviewed and merged by a maintainer. The repo setting "Allow GitHub
Actions to create and approve pull requests" must stay enabled for the
workflow to publish them.

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
