import { expect, test, type Locator } from "@playwright/test";
import { BUILTIN_TASK_MANIFESTS } from "@oh-my-otter/benchmarks/report";

const ADD_UNIT_TEST_TITLE = BUILTIN_TASK_MANIFESTS.find(
  (task) => task.id === "add-unit-test",
)!.title;

async function assertPassBarGeometry(chart: Locator, expectedRates: number[]) {
  await expect(
    chart
      .locator(".recharts-bar-rectangle path, .recharts-bar-rectangle rect")
      .first(),
  ).toBeVisible();
  const { plotWidth, bars } = await chart.evaluate((root) => {
    const svg = root.querySelector("svg");
    const axisLine = svg?.querySelector(
      ".recharts-xAxis .recharts-cartesian-axis-line",
    );
    const plotWidth =
      Number(axisLine?.getAttribute("x2")) -
      Number(axisLine?.getAttribute("x1"));
    const bars = [
      ...root.querySelectorAll(
        ".recharts-bar-rectangle path, .recharts-bar-rectangle rect",
      ),
    ].map((bar) => {
      const bounds = (bar as SVGGraphicsElement).getBBox();
      return { y: bounds.y, width: bounds.width };
    });
    return { plotWidth, bars: bars.sort((a, b) => a.y - b.y) };
  });

  expect(plotWidth).toBeGreaterThan(0);
  expect(bars.length).toBeGreaterThan(0);
  expect(bars).toHaveLength(expectedRates.length);
  for (const [index, bar] of bars.entries()) {
    expect(
      Math.abs(bar.width - (expectedRates[index]! / 100) * plotWidth),
    ).toBeLessThanOrEqual(plotWidth * 0.03);
  }
}

async function assertStackedBarGeometry(chart: Locator) {
  await expect(
    chart
      .locator(".recharts-bar-rectangle path, .recharts-bar-rectangle rect")
      .first(),
  ).toBeVisible();

  const { plotWidth, rows } = await chart.evaluate((root) => {
    const svg = root.querySelector("svg");
    const axisLine = svg?.querySelector(
      ".recharts-xAxis .recharts-cartesian-axis-line",
    );
    const plotWidth =
      Number(axisLine?.getAttribute("x2")) -
      Number(axisLine?.getAttribute("x1"));
    const rows = new Map<number, number>();
    for (const bar of root.querySelectorAll(
      ".recharts-bar-rectangle path, .recharts-bar-rectangle rect",
    )) {
      const bounds = (bar as SVGGraphicsElement).getBBox();
      const y = Math.round(bounds.y * 10) / 10;
      rows.set(y, (rows.get(y) ?? 0) + bounds.width);
    }
    return { plotWidth, rows: [...rows.values()] };
  });

  expect(plotWidth).toBeGreaterThan(0);
  expect(rows.length).toBeGreaterThan(0);
  for (const width of rows) {
    expect(Math.abs(width - plotWidth)).toBeLessThanOrEqual(plotWidth * 0.03);
  }
}

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
  await expect(task.locator(".recharts-yAxis-tick-labels")).toContainText(
    "Claude Code",
  );
  await expect(task.locator(".recharts-yAxis-tick-labels")).toContainText(
    "n=10",
  );
  await expect(task.locator(".recharts-yAxis-tick-labels")).toContainText(
    "Other",
  );
  await expect(task.locator(".recharts-yAxis-tick-labels")).toContainText(
    "n=5",
  );
  await expect(
    task.getByText("Other is shown but not ranked.", { exact: true }),
  ).toBeVisible();

  const passCharts = page.locator("[data-testid=success-rate-chart]");
  await expect(passCharts).toHaveCount(2);
  const bandTable = page
    .getByText("By readiness band", { exact: true })
    .locator("xpath=..")
    .locator("table");
  const expectedBandRates = await bandTable
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.slice(0, 2).map((row) => {
        const passCell = row.querySelectorAll("td")[2];
        return Number(passCell?.textContent?.trim().replace("%", ""));
      }),
    );
  await assertPassBarGeometry(passCharts.nth(0), expectedBandRates);

  const taskTable = page
    .getByText("By task", { exact: true })
    .locator("xpath=..")
    .locator("table");
  const addUnitRow = taskTable
    .locator("tbody tr")
    .filter({ hasText: "add-unit-test" });
  const expectedTaskRate = await addUnitRow.evaluate((row) => {
    const passCell = row.querySelectorAll("td")[2];
    return Number(passCell?.textContent?.trim().replace("%", ""));
  });
  await assertPassBarGeometry(passCharts.nth(1), [expectedTaskRate]);
  await expect(passCharts.nth(0).locator(".recharts-label")).toHaveText([
    "46% · n=13",
    "43% · n=7",
  ]);
  await expect(passCharts.nth(1).locator(".recharts-label")).toHaveText(
    "40% · n=15",
  );

  const outcomeCharts = page.locator("[data-testid=outcome-chart]");
  expect(await outcomeCharts.count()).toBeGreaterThan(0);
  for (let index = 0; index < (await outcomeCharts.count()); index += 1) {
    await assertStackedBarGeometry(outcomeCharts.nth(index));
  }

  await expect(
    page.getByRole("link", { name: "Download the raw data" }),
  ).toBeVisible();
  await expect(page.getByText("By task", { exact: true })).toBeVisible();
});
