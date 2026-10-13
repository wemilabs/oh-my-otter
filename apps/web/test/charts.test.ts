import { describe, expect, it } from "vitest";
import type { AgentGroup, Group } from "@oh-my-otter/benchmarks/report";
import { chartHeightForRows, toRateRows } from "../src/lib/charts";

describe("chartHeightForRows", () => {
  it("scales by row count and includes the axis height", () => {
    expect(chartHeightForRows(0)).toBe(56);
    expect(chartHeightForRows(1)).toBe(104);
    expect(chartHeightForRows(4)).toBe(248);
  });
});

function group(
  key: string,
  n: number,
  enough: boolean,
  passRate: number | null,
): Group {
  return {
    key,
    label: key,
    stats: {
      n,
      enough,
      pass_rate: enough ? passRate : null,
      partial_rate: enough ? 0.2 : null,
      fail_rate: enough ? 0.1 : null,
      median_corrections: enough ? 1 : null,
      median_minutes: enough ? 10 : null,
      median_attempts: enough ? 1 : null,
      mean_attempts: enough ? 1 : null,
    },
  };
}

describe("toRateRows", () => {
  it("suppresses rates below the minimum sample", () => {
    expect(toRateRows([group("small", 4, false, null)])).toEqual([
      {
        key: "small",
        label: "small",
        n: 4,
        enough: false,
        ranked: true,
        pass: null,
        partial: null,
        fail: null,
      },
    ]);
  });

  it("converts enough rates to percentages and keeps other unranked", () => {
    const other: AgentGroup = {
      ...group("other", 5, true, 0.6),
      label: "Other",
      ranked: false,
      versions: [],
      models: [],
    };
    expect(toRateRows([other])).toEqual([
      {
        key: "other",
        label: "Other",
        n: 5,
        enough: true,
        ranked: false,
        pass: 60,
        partial: 20,
        fail: 10,
      },
    ]);
  });

  it("preserves order and handles empty groups", () => {
    expect(
      toRateRows([group("B", 0, false, null), group("A", 6, true, 0.5)]),
    ).toMatchObject([
      { key: "B", n: 0, pass: null },
      { key: "A", n: 6, pass: 50 },
    ]);
    expect(toRateRows([])).toEqual([]);
  });
});
