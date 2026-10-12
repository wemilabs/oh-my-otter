import { defineConfig } from "vitest/config";
import { sharedConfig } from "../../vitest.shared";

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    testTimeout: 15000,
  },
});
