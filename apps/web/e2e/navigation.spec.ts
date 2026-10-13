import { instant } from "@next/playwright";
import { test, expect } from "@playwright/test";
import { BUILTIN_TASK_MANIFESTS } from "@oh-my-otter/benchmarks/report";

const ADD_UNIT_TEST_TITLE = BUILTIN_TASK_MANIFESTS.find(
  (task) => task.id === "add-unit-test",
)!.title;

test("initial load of /results renders the shell instantly", async ({
  page,
  baseURL,
}) => {
  await instant(
    page,
    async () => {
      await page.goto(`${baseURL}/results`);
      await expect(
        page.getByRole("heading", { name: "Anonymous benchmark results" }),
      ).toBeVisible();
    },
    { baseURL },
  );
});

test("client navigation / -> /results is instant", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/`);
  await instant(page, async () => {
    await page.getByRole("link", { name: "Results" }).first().click();
    await page.waitForURL(`${baseURL}/results`);
    await expect(
      page.getByRole("heading", { name: "Anonymous benchmark results" }),
    ).toBeVisible();
  });
  await expect(page.getByText("Total reports")).toBeVisible();
});

test("client navigation /results -> task page is instant", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/results`);
  await instant(page, async () => {
    await page
      .locator('a[href="/tasks/add-unit-test"]:visible')
      .first()
      .click();
    await page.waitForURL(`${baseURL}/tasks/add-unit-test`);
  });
  await expect(
    page.getByRole("heading", { name: ADD_UNIT_TEST_TITLE }),
  ).toBeVisible();
  await expect(page.getByText("All reports for this task")).toBeVisible();
  await expect(
    page.getByText("Results by readiness band").first(),
  ).toBeVisible();
});
