Remove every explicit `any` type from `{{file}}` and replace each one with an accurate type.

- Prefer precise types; use `unknown` with narrowing where the type is truly unknown.
- Do not add `@ts-ignore`, `@ts-expect-error`, or `@ts-nocheck` comments, and do not disable lint rules.
- Keep runtime behavior unchanged, and do not delete or rename the file.
- Make sure the project typechecks.
