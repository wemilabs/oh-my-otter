import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { UserConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export const sharedConfig: UserConfig = {
  fsModuleCachePath: resolve(process.cwd(), "node_modules/.vitest-cache"),
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
        find: /^@oh-my-otter\/benchmarks$/,
        replacement: resolve(root, "packages/benchmarks/src/index.ts"),
      },
      {
        find: /^@oh-my-otter\/checks$/,
        replacement: resolve(root, "packages/checks/src/index.ts"),
      },
    ],
  },
  plugins: [
    {
      name: "omot-markdown-text",
      transform(code, id) {
        if (!id.endsWith(".md")) return null;
        return { code: `export default ${JSON.stringify(code)};`, map: null };
      },
    },
  ],
  test: {
    exclude: ["**/fixtures/**", "**/dist/**", "**/node_modules/**"],
  },
};
