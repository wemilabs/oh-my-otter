import { test, expect } from "@playwright/test";
import { builtinChecks } from "@oh-my-otter/checks";

test("methodology shows current check weights and grade bands", async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/methodology`);
  await expect(
    page.getByRole("heading", { name: "Scoring formula" }),
  ).toBeVisible();
  await expect(page.locator("tr[data-check-weight-row]")).toHaveCount(
    builtinChecks.length,
  );
  for (const band of ["90–100", "75–89", "60–74", "0–59"]) {
    await expect(page.getByText(band, { exact: true })).toBeVisible();
  }
});
