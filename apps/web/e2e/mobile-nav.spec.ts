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

test("the menu button is the right-most header control", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/`);
  const header = page.locator("header");
  const menu = header.getByRole("button", { name: "Open menu" });
  const logo = header.getByRole("link", { name: "Oh My Otter" });
  const menuBox = await menu.boundingBox();
  const logoBox = await logo.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(logoBox).not.toBeNull();
  expect(menuBox!.x).toBeGreaterThan(logoBox!.x);
  const rightEdges = await header
    .locator("a, button")
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => element.getBoundingClientRect().right),
    );
  expect(Math.max(...rightEdges)).toBe(menuBox!.x + menuBox!.width);
});

test("the closed header hides the theme toggle and Get started", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/`);
  const header = page.locator("header");
  await expect(header.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(
    header.getByRole("button", { name: "Toggle color theme" }),
  ).toBeHidden();
  await expect(header.getByRole("link", { name: "Get started" })).toBeHidden();
});

test("the open menu ends with the theme toggle and Get started", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/`);
  const toggle = page.locator('button[aria-controls="mobile-nav"]');
  await toggle.click();
  const menu = page.locator("#mobile-nav");
  await expect(menu).toBeVisible();

  const theme = menu.getByRole("button", { name: "Toggle color theme" });
  const getStarted = menu.getByRole("link", { name: "Get started" });
  await expect(theme).toBeVisible();
  await expect(getStarted).toBeVisible();
  const lastLink = await menu.locator("ul li").last().boundingBox();
  const themeBox = await theme.boundingBox();
  const getStartedBox = await getStarted.boundingBox();
  const lastLinkBottom = lastLink!.y + lastLink!.height;
  expect(themeBox!.y).toBeGreaterThanOrEqual(lastLinkBottom);
  expect(getStartedBox!.y).toBeGreaterThanOrEqual(lastLinkBottom);

  const html = page.locator("html");
  const wasDark = await html.evaluate((element) =>
    element.classList.contains("dark"),
  );
  await theme.click();
  if (wasDark) await expect(html).not.toHaveClass(/\bdark\b/);
  else await expect(html).toHaveClass(/\bdark\b/);
  await expect(menu).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await theme.click();
  if (wasDark) await expect(html).toHaveClass(/\bdark\b/);
  else await expect(html).not.toHaveClass(/\bdark\b/);
  await expect(menu).toBeVisible();

  await getStarted.click();
  await page.waitForURL(`${baseURL}/#quickstart`);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();
});

test.describe("desktop header", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("shows the theme toggle and Get started without a menu button", async ({
    page,
    baseURL,
  }) => {
    await page.goto(`${baseURL}/`);
    const header = page.locator("header");
    await expect(
      header.getByRole("button", { name: "Toggle color theme" }),
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: "Get started" }),
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Open menu" }),
    ).toBeHidden();
  });
});
