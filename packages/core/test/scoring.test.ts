import { describe, expect, it } from "vitest";
import { computeScore, gradeFor } from "../src/scoring";

describe("computeScore", () => {
  it("scores all passing checks as 100 A", () => {
    expect(computeScore([{ weight: 3, status: "pass" }])).toMatchObject({
      score: 100,
      grade: "A",
      earned: 3,
      possible: 3,
    });
  });

  it("scores all na checks as 0 D", () => {
    expect(computeScore([{ weight: 5, status: "na" }])).toMatchObject({
      score: 0,
      grade: "D",
      earned: 0,
      possible: 0,
    });
  });

  it("excludes na from the denominator", () => {
    expect(
      computeScore([
        { weight: 2, status: "pass" },
        { weight: 5, status: "na" },
      ]),
    ).toMatchObject({ score: 100, possible: 2 });
  });

  it("counts warn as half weight in the numerator and denominator", () => {
    expect(
      computeScore([
        { weight: 5, status: "pass" },
        { weight: 2, status: "warn" },
        { weight: 3, status: "fail" },
      ]),
    ).toMatchObject({ earned: 6, possible: 9, score: 67, grade: "C" });
    expect(computeScore([{ weight: 3, status: "warn" }])).toMatchObject({
      score: 100,
      earned: 1.5,
      possible: 1.5,
    });
  });

  it("rounds scores", () => {
    expect(
      computeScore([
        { weight: 1, status: "pass" },
        { weight: 35, status: "fail" },
      ]).score,
    ).toBe(3);
  });

  it("sets scoring_version to 1", () => {
    expect(computeScore([]).scoring_version).toBe(1);
  });
});

describe("gradeFor", () => {
  it.each([
    [90, "A"],
    [89, "B"],
    [75, "B"],
    [74, "C"],
    [60, "C"],
    [59, "D"],
    [0, "D"],
    [100, "A"],
  ] as const)("maps %i to %s", (score, grade) => {
    expect(gradeFor(score)).toBe(grade);
  });
});
