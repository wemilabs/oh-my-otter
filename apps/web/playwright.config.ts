import { defineConfig } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const datasetUrl = pathToFileURL(
  path.join(here, "test", "fixtures", "reports.ndjson"),
).href;
const port = 3301;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `pnpm exec next build && EXPOSE_TESTING_API=0 pnpm exec next start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      EXPOSE_TESTING_API: "1",
      OMOT_DATASET_URL: datasetUrl,
    },
  },
});
