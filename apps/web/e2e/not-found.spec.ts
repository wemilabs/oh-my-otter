import { test, expect } from "@playwright/test";

test("404 pages render one set of chrome", async ({ page, baseURL }) => {
  for (const path of ["/tasks/nope", "/nope", "/docs/nope"]) {
    await page.goto(`${baseURL}${path}`);
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await expect(page.locator("header")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("footer")).toHaveCount(1);
  }
});
