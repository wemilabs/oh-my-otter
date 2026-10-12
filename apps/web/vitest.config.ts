import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { sharedConfig } from "../../vitest.shared";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  ...sharedConfig,
  resolve: {
    alias: [
      {
        find: /^server-only$/,
        replacement: resolve(here, "test/server-only-stub.ts"),
      },
      ...(sharedConfig.resolve?.alias ?? []),
    ],
  },
  test: {
    ...sharedConfig.test,
    environment: "node",
  },
});
