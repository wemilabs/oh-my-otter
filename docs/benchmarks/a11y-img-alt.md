# a11y-img-alt

Add missing alt attributes to images. Category: accessibility. Scope: small.

```sh
omot bench start a11y-img-alt --param dir=src/components --agent <your-agent>
```

## Parameters

| Name  | Kind | Description                                            | Example          |
| ----- | ---- | ------------------------------------------------------ | ---------------- |
| `dir` | path | The directory to fix, relative to the repository root. | `src/components` |

## Preconditions

- The directory contains at least one <img> or <Image> tag without an alt attribute.
- A build script (scripts.build).

## Outcomes

- **pass**: No <img> or <Image> tag in the directory is missing alt, no images were removed, and the build script passes.
- **partial**: Fewer tags are missing alt but some remain, images were removed, or the build fails.
- **fail**: The number of tags missing alt did not drop.

## How it is verified

- Statically scans `html`, `jsx`, `tsx`, `js`, `mjs`, `vue`, `svelte`, `astro`, and `mdx` files under the directory for `<img>` and `<Image>` tags.
- A tag counts as having alt if it has `alt`, `:alt`, `v-bind:alt`, `[alt]`, or a JSX spread (`{...props}`). HTML comments are ignored.
- Runs the `build` script.
- The build exit code is recorded at start. A build failure that also occurred at baseline is not counted against the agent; if baseline scripts were skipped or no baseline build script existed, baseline health is reported as unknown.
- This is a heuristic, not a full parser; see the plan for later stretch tasks.

The prompt and verifier live in [`packages/benchmarks/src/tasks/a11y-img-alt`](../../packages/benchmarks/src/tasks/a11y-img-alt). Changing either requires a `version` bump in `task.json`.
