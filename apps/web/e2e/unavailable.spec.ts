import { test, expect } from "@playwright/test";

test.skip(
  !process.env.OMOT_DATASET_URL?.startsWith("http://127.0.0.1:9/"),
  "requires the unavailable-dataset Playwright configuration",
);

test("home stats show an em dash when the dataset is unavailable", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/`);
  await expect(page.getByText("Data temporarily unavailable")).toBeVisible();
  const reports = page
    .locator("dl > div")
    .filter({ hasText: "anonymous reports so far" });
  await expect(reports.locator("dd")).toHaveText("—");
});
