---
title: Benchmarks
description: Local benchmark tasks for evaluating coding agents.
---

A benchmark task is a prompt you give any coding agent to work on a repository. After the agent finishes, `omot bench verify` checks the result locally and reports pass, partial, or fail. Each page below describes one task and its verification criteria. New to omot? Follow [Run a benchmark and submit it](../run-a-benchmark.md) for the full start, verify, and report flow.

- [add-unit-test](./add-unit-test.md)
- [dep-patch-bump](./dep-patch-bump.md)
- [fix-lint-rule](./fix-lint-rule.md)
- [a11y-img-alt](./a11y-img-alt.md)
- [ts-strict-file](./ts-strict-file.md)
- [fix-failing-test](./fix-failing-test.md)

See [Writing a benchmark task](../writing-a-task.md) to create one.
