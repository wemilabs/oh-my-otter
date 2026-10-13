---
"oh-my-otter": patch
---

The dep-patch-bump benchmark now checks that the bumped version is installed in node_modules; a bump that was never installed is partial instead of passing.
