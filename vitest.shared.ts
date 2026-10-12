import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { UserConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export const sharedConfig: UserConfig = {
  resolve: {
    alias: [
      {
        find: /^@oh-my-otter\/core\/node$/,
        replacement: resolve(root, "packages/core/src/node.ts"),
      },
      {
        find: /^@oh-my-otter\/core$/,
        replacement: resolve(root, "packages/core/src/index.ts"),
      },
      {
        find: /^@oh-my-otter\/checks$/,
        replacement: resolve(root, "packages/checks/src/index.ts"),
      },
    ],
  },
  test: {
    exclude: ["**/fixtures/**", "**/dist/**", "**/node_modules/**"],
  },
};
