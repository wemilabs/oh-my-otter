# @oh-my-otter/web

The public Oh My Otter website (Next.js), deployed at
<https://ohmyotter.vercel.app>.

```sh
pnpm --filter @oh-my-otter/web dev    # local dev server
pnpm --filter @oh-my-otter/web build  # static build (requires pnpm build first via turbo)
pnpm --filter @oh-my-otter/web start  # serve the production build
```

## Data

Data pages (`/`, `/results`, `/tasks`) aggregate reports from
`reports.ndjson` on the orphan `dataset` branch
(`https://raw.githubusercontent.com/wemilabs/oh-my-otter/dataset/reports.ndjson`)
via `src/lib/dataset.ts`: `loadReports` (in `@oh-my-otter/benchmarks/report`)
is wrapped by `getDataset`, a Cache Components `'use cache'` function with
`cacheLife('hours')`. `dataset/agents.json` is read from the
repo at build time; `/privacy` renders the repo-root `PRIVACY.md`.

The header star count comes from `src/lib/github.ts` (`getStarCount`, `'use
cache'` hourly); failures fall back to the plain "GitHub" button and retry
after minutes. Optional `GITHUB_TOKEN` raises the rate limit (it is only sent
to `api.github.com`), and `OMOT_GITHUB_REPO_API_URL` overrides the endpoint
(for example, `http://127.0.0.1:9/x` to test the fallback).

To develop against a local copy of the dataset:

```sh
OMOT_DATASET_URL="file://$PWD/apps/web/test/fixtures/reports.ndjson" pnpm --filter @oh-my-otter/web dev
```

## Analytics

The site uses Vercel Web Analytics and Speed Insights (cookieless, aggregated
page-view and performance metrics only). See `PRIVACY.md`.

## Mobile overflow check

Not part of CI. Start a Chrome with `--remote-debugging-port=29229`, serve the
site (e.g. `pnpm build && pnpm start` on :3300), then:

```sh
node apps/web/scripts/check-overflow.mjs http://localhost:3300
```

It visits every route at 320–768px in light and dark and fails on horizontal
overflow or interactive elements under 44×44px. Uses `playwright-core` from
`~/devin-ref/node_modules` (or a local install).
