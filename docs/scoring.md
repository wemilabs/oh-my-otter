---
title: Scoring
description: Scoring version 1 uses each applicable check's weight as its maximum contribution.
---

Scoring version 1 uses each applicable check's weight as its maximum contribution.

- `pass` earns the full weight and contributes the full weight to the possible total.
- `warn` earns half the weight and contributes half the weight to the possible total.
- `fail` earns no points but contributes the full weight to the possible total.
- `na` is excluded from both totals.

The score is `Math.round(100 × earned / possible)`. When no checks apply (`possible` is zero), the score is 0 and the grade is D.

Grades are A for scores 90–100, B for 75–89, C for 60–74, and D for 0–59.
