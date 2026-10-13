import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const datasetUrl = process.env.OMOT_DATASET_URL;
const isMissingFileDataset = (() => {
  if (!datasetUrl?.startsWith("file:")) return false;
  try {
    return !existsSync(fileURLToPath(datasetUrl));
  } catch {
    return false;
  }
})();

test.skip(
  !isMissingFileDataset,
  "requires a missing file:// dataset configuration",
);

test("empty results explain the empty dataset without chart bars or errors", async ({
  page,
  baseURL,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto(`${baseURL}/results`);
  await expect(page.getByText("No reports yet — be the first")).toBeVisible();
  await expect(page.locator("#charts-heading")).toHaveCount(0);
  await expect(
    page.locator('section[aria-labelledby="charts-heading"]'),
  ).toHaveCount(0);
  await expect(page.locator("[data-testid=success-rate-chart]")).toHaveCount(0);
  await expect(page.locator("[data-testid=outcome-chart]")).toHaveCount(0);
  await expect(page.locator(".recharts-bar-rectangle path")).toHaveCount(0);
  await expect(pageErrors).toEqual([]);
});
