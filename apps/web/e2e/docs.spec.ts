import { test, expect } from "@playwright/test";

test("docs index renders", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/docs`);
  await expect(
    page.getByRole("heading", { name: "Oh My Otter documentation" }),
  ).toBeVisible();
});

test("sidebar navigates to a benchmark page", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/docs`);
  await page.getByRole("button", { name: "Benchmarks" }).click();
  await page.getByRole("link", { name: "add-unit-test" }).first().click();
  await page.waitForURL(`${baseURL}/docs/benchmarks/add-unit-test`);
  await expect(
    page.getByRole("heading", { name: "add-unit-test" }),
  ).toBeVisible();
});

test("static docs search finds CLI guidance", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/docs`);
  await page
    .getByRole("button", { name: /search/i })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder(/search/i).fill("min-score");

  const result = dialog
    .getByRole("option", { name: /Documentation (CLI reference|CI usage)/ })
    .first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/\/docs\/(cli|ci)$/);
});

test("site header links to docs", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await page.getByRole("banner").getByRole("link", { name: "Docs" }).click();
  await page.waitForURL(`${baseURL}/docs`);
  await expect(
    page.getByRole("heading", { name: "Oh My Otter documentation" }),
  ).toBeVisible();
});
