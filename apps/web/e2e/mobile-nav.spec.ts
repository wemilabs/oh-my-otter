import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 375, height: 800 } });

test("clicking the current route's link closes the menu", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/results`);
  const toggle = page.getByRole("button", { name: "Open menu" });
  await toggle.click();
  await expect(page.locator("#mobile-nav")).toBeVisible();
  await page
    .locator("#mobile-nav")
    .getByRole("link", { name: "Results" })
    .click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#mobile-nav")).toBeHidden();
});

test("browser Back does not reopen the menu", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  const toggle = page.getByRole("button", { name: "Open menu" });
  await toggle.click();
  await expect(page.locator("#mobile-nav")).toBeVisible();
  await page
    .locator("#mobile-nav")
    .getByRole("link", { name: "Results" })
    .click();
  await page.waitForURL(`${baseURL}/results`);
  await page.goBack();
  await page.waitForURL(`${baseURL}/`);
  await expect(page.locator("#mobile-nav")).toBeHidden();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
});

test("browser Back after header logo navigation keeps the menu closed", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/tasks`);
  const toggle = page.getByRole("button", { name: "Open menu" });
  await toggle.click();
  await expect(page.locator("#mobile-nav")).toBeVisible();
  await page
    .locator("header")
    .getByRole("link", { name: "Oh My Otter" })
    .click();
  await page.waitForURL(`${baseURL}/`);
  await page.goBack();
  await page.waitForURL(`${baseURL}/tasks`);
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
