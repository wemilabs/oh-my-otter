---
title: CI usage
description: Fail continuous integration when a repository readiness score is below your threshold.
---

Use `--min-score` to make a readiness scan fail when its score is below an integer threshold from 0 to 100:

```sh
omot scan --min-score 80
```

The scan exits with code 1 when the score is below the threshold, and code 0 when it meets or exceeds it. Invalid thresholds and other command errors also exit with code 1.

For example, add a workflow that runs the same command on pushes and pull requests:

```yaml
name: Repository readiness

on:
  push:
  pull_request:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22.13
      - run: npx oh-my-otter scan --min-score 80
```
