import { test, expect } from "@playwright/test";
import { builtinChecks } from "@oh-my-otter/checks";

test("checks are fully rendered and searchable", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/checks`);
  const cards = page.locator('a[href^="/checks/"]');
  await expect(cards).toHaveCount(builtinChecks.length);

  const search = page.getByRole("searchbox", { name: "Search checks" });
  await search.fill("gitignore");
  await expect(page.locator('a[href="/checks/gitignore-sane"]')).toBeVisible();
  await expect(cards).toHaveCount(1);

  await search.clear();
  const docsChecks = builtinChecks.filter((check) => check.category === "docs");
  const docsFilter = page.getByRole("button", { name: /docs/i });
  await docsFilter.click();
  await expect(docsFilter).toHaveAttribute("aria-pressed", "true");
  await expect(docsFilter).toContainText(String(docsChecks.length));
  await expect(cards).toHaveCount(docsChecks.length);

  await search.fill("install-documented");
  await expect(cards).toHaveCount(1);
  await expect(
    page.locator('a[href="/checks/install-documented"]'),
  ).toBeVisible();

  await search.fill("zzzzzzzzzzzz");
  await expect(
    page.getByText(
      "No checks match this search. Try another term or category.",
    ),
  ).toBeVisible();
});

test("the complete catalog is present without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/checks`);
  await expect(page.locator('a[href^="/checks/"]')).toHaveCount(
    builtinChecks.length,
  );
  await context.close();
});

test.describe("URL-bound filters", () => {
  test("a q param seeds the search box and filters the cards", async ({
    page,
    baseURL,
  }) => {
    await page.goto(`${baseURL}/checks?q=gitignore`);
    const search = page.getByRole("searchbox", { name: "Search checks" });
    await expect(search).toHaveValue("gitignore");
    await expect(page.locator('a[href^="/checks/"]')).toHaveCount(1);
    await expect(
      page.locator('a[href="/checks/gitignore-sane"]'),
    ).toBeVisible();
  });

  test("a category param activates its button and filters the cards", async ({
    page,
    baseURL,
  }) => {
    const docsChecks = builtinChecks.filter(
      (check) => check.category === "docs",
    );
    await page.goto(`${baseURL}/checks?category=docs`);
    await expect(page.getByRole("button", { name: /docs/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('a[href^="/checks/"]')).toHaveCount(
      docsChecks.length,
    );
  });

  test("q and category params combine", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/checks?q=install-documented&category=docs`);
    await expect(page.locator('a[href^="/checks/"]')).toHaveCount(1);
  });

  test("interactions write the filters into the URL", async ({
    page,
    baseURL,
  }) => {
    await page.goto(`${baseURL}/checks`);
    const search = page.getByRole("searchbox", { name: "Search checks" });
    await search.fill("gitignore");
    await expect(page).toHaveURL(/[?&]q=gitignore/);

    await page.getByRole("button", { name: /docs/i }).click();
    await expect(page).toHaveURL(/[?&]category=docs/);

    await page.getByRole("button", { name: /^all/i }).click();
    await search.clear();
    await expect(page).toHaveURL(`${baseURL}/checks`);
  });

  test("filters survive a reload", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/checks?q=install-documented&category=docs`);
    await page.reload();
    const search = page.getByRole("searchbox", { name: "Search checks" });
    await expect(search).toHaveValue("install-documented");
    await expect(page.getByRole("button", { name: /docs/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('a[href^="/checks/"]')).toHaveCount(1);
  });

  test("an unknown category param falls back to all", async ({
    page,
    baseURL,
  }) => {
    await page.goto(`${baseURL}/checks?category=bogus`);
    await expect(page.getByRole("button", { name: /^all/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('a[href^="/checks/"]')).toHaveCount(
      builtinChecks.length,
    );
  });
});

test("a check card opens its details", async ({ page, baseURL }) => {
  const check = builtinChecks[0]!;
  await page.goto(`${baseURL}/checks`);
  await page.locator(`a[href="/checks/${check.id}"]`).click();
  await expect(page).toHaveURL(`${baseURL}/checks/${check.id}`);
  await expect(page.getByRole("heading", { name: check.title })).toBeVisible();
  await expect(
    page.getByText(new RegExp(`weight ${check.weight}`)),
  ).toBeVisible();
  await expect(
    page.getByText(check.why, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How to pass" }),
  ).toBeVisible();
});

test("unknown check details return a single-header 404", async ({
  page,
  baseURL,
}) => {
  const response = await page.goto(`${baseURL}/checks/nope`);
  expect(response?.status()).toBe(404);
  await expect(page.locator("h1")).toHaveCount(1);
});

test("unknown task details return a 404", async ({ page, baseURL }) => {
  const response = await page.goto(`${baseURL}/tasks/nope`);
  expect(response?.status()).toBe(404);
  await expect(page.locator("h1")).toHaveCount(1);
});
