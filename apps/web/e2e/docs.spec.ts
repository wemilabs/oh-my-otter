import { test, expect } from "@playwright/test";

test("docs index renders", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/docs`);
  await expect(
    page.getByRole("heading", { name: "Oh My Otter documentation" }),
  ).toBeVisible();
});

test("benchmark docs index renders and links from the sidebar", async ({
  page,
  baseURL,
}) => {
  const response = await page.goto(`${baseURL}/docs/benchmarks`);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Benchmarks", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Benchmarks", exact: true }).first(),
  ).toHaveAttribute("href", "/docs/benchmarks");
});

test("run-a-benchmark guide renders and links from the sidebar", async ({
  page,
  baseURL,
}) => {
  const response = await page.goto(`${baseURL}/docs/run-a-benchmark`);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Run a benchmark and submit it" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Run a benchmark and submit it" }).first(),
  ).toHaveAttribute("href", "/docs/run-a-benchmark");
});

test("benchmark docs index links to the run-a-benchmark guide", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/docs/benchmarks`);
  await expect(
    page.getByRole("link", { name: "Run a benchmark and submit it" }).first(),
  ).toHaveAttribute("href", "/docs/run-a-benchmark");
});

test("methodology links to the benchmark docs index", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/methodology`);
  await page
    .getByRole("link", { name: "Browse benchmark documentation" })
    .click();
  await expect(page).toHaveURL(`${baseURL}/docs/benchmarks`);
  const response = await page.request.get(page.url());
  expect(response.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Benchmarks", exact: true }),
  ).toBeVisible();
});

test("sidebar navigates to a benchmark page", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/docs`);
  await page.getByRole("link", { name: "Benchmarks", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Benchmarks", exact: true }),
  ).toBeVisible();
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
