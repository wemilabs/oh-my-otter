---
title: Quickstart
description: Install Oh My Otter and run a repository-readiness scan.
---

Oh My Otter requires Node.js **22.13 or later**.

Run a scan without installing the CLI globally:

```sh
npx oh-my-otter scan
```

The scan checks the current directory. To scan another repository, pass its path:

```sh
npx oh-my-otter scan /path/to/repository
```

The package also provides the `omot` executable. Install it globally with npm if you want to use it directly:

```sh
npm install --global oh-my-otter
omot scan
```

The `scan` command is the default, so `omot` and `omot scan` both scan the current directory. Scans run locally and make no network calls.

To include repository test scripts in the scan, pass `--run`:

```sh
omot scan --run
```

See the [CLI reference](./cli) for all commands and options, or [CI usage](./ci) to enforce a minimum score.
