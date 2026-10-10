# Oh My Otter

An open-source benchmark and optimization toolkit for seamless Devin integration.

## What it does

### 1. Scan your repo

`omot init` checks your repo for the things Devin depends on, such as runnable tests, documented setup, lint and typecheck scripts, and CI. You get a readiness score and a list of specific, fixable findings. Run `omot init --fix` to generate missing pieces. The scan runs entirely on your machine and makes no network calls.

### 2. Benchmark Devin on your code

`omot bench` gives you a small set of standardized tasks, such as bumping a dependency or adding a unit test. Run one with Devin, then let the CLI verify the result locally, so the outcome is a clear pass, partial, or fail instead of an opinion. You also record how many human corrections it took.

### 3. Share results and see the data

`omot report` shows you the exact data it would send, and sends nothing until you confirm. Reports contain only coarse, anonymous fields: no code, file names, or repo details. The website turns submitted reports into public aggregate results, showing whether higher readiness scores go with fewer corrections.
