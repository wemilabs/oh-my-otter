import { test, expect } from "@playwright/test";
import { BUILTIN_TASK_MANIFESTS } from "@oh-my-otter/benchmarks/report";

const ADD_UNIT_TEST_TITLE = BUILTIN_TASK_MANIFESTS.find(
  (task) => task.id === "add-unit-test",
)!.title;

test("results charts show only adequately sampled rates", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/results`);
  const bands = page
    .locator("figure")
    .filter({ hasText: "Pass rate by readiness band" });
  await expect(bands.locator(".recharts-bar-rectangle path")).toHaveCount(2);
  await expect(bands.getByText(/C · n=/)).toBeVisible();
  await expect(bands.getByText(/D · n=/)).toBeVisible();
  await expect(bands.getByText(/Not enough data yet/).first()).toBeVisible();

  const task = page.locator("figure").filter({ hasText: ADD_UNIT_TEST_TITLE });
  await expect(task.getByText("Claude", { exact: true })).toBeVisible();
  await expect(task.getByText("Code", { exact: true })).toBeVisible();
  await expect(task.getByText("n=10", { exact: true })).toBeVisible();
  await expect(task.getByText("Other", { exact: true })).toBeVisible();
  await expect(task.getByText("n=5", { exact: true })).toBeVisible();
  await expect(
    task.getByText("Other is shown but not ranked.", { exact: true }),
  ).toBeVisible();
  expect(
    await task.locator(".recharts-bar-rectangle path").count(),
  ).toBeGreaterThan(0);
  await expect(
    page.getByRole("link", { name: "Download the raw data" }),
  ).toBeVisible();
  await expect(page.getByText("By task", { exact: true })).toBeVisible();
});
