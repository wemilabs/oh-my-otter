import { defineConfig } from "vitest/config";
import { sharedConfig } from "../../vitest.shared";

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    exclude: [...(sharedConfig.test?.exclude ?? []), "**/.tmp/**"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
