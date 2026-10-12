Update the npm dependency `{{package}}` in this repository to the newest version within its current major version. This is a patch or minor update only; for a 0.x version, stay within the current minor version.

- Update the version range in `package.json` if needed, and regenerate the lockfile with the repository's package manager.
- Do not add, remove, or change any other dependency.
- Make sure the `build` and `test` scripts in `package.json` still pass, for whichever of them exist. Other suites, such as end-to-end tests, are not part of this task.
