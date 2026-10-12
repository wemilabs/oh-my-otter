# @oh-my-otter/web

The public Oh My Otter website (Next.js, static pages).

```sh
pnpm --filter @oh-my-otter/web dev    # local dev server
pnpm --filter @oh-my-otter/web build  # static build (requires pnpm build first via turbo)
pnpm --filter @oh-my-otter/web start  # serve the production build
```

Data pages (`/results`, `/tasks`) aggregate `dataset/reports/*.json` and
`dataset/agents.json` at build time via `src/lib/dataset.ts` and
`@oh-my-otter/benchmarks/report`. `/privacy` renders the repo-root
`PRIVACY.md`. No analytics, no cookies.
