# Security policy

## Supported versions

Only the latest `0.x` minor release of `oh-my-otter`, `@oh-my-otter/core`, and `@oh-my-otter/checks` gets security fixes. Upgrade to it before reporting.

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/wemilabs/oh-my-otter/security/advisories/new). Don't open a public issue. Include the affected version, steps to reproduce, and the impact.

## Scope

In scope:

- The `omot` CLI and the published packages, for example a built-in check that makes a network call, writes to a scanned repository, or a `--fix` that overwrites an existing file.
- The report ingest Action (`.github/workflows/ingest-report.yml`), for example a payload that bypasses validation or leaks submitter data into the dataset.
- The website (`apps/web`, <https://ohmyotter.vercel.app>).

Out of scope:

- Code run by plugins (`--plugin`) and `omot.config.*` files. Loading them executes local code with your privileges by design, the same as a build script; validation checks their shape only. Only load plugins and configs you trust.
- Repository scripts that `omot scan --run` and `omot bench` run on purpose, such as `scripts.test`.
