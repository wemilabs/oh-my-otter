import { describe, expect, it } from "vitest";
import { InvalidCheckError, validateCheck } from "../src/schema";

describe("validateCheck", () => {
  it("returns valid checks unchanged", () => {
    const check = {
      id: "well-formed",
      title: "Valid check",
      category: "setup",
      weight: 1,
      why: "It matters.",
      async run() {
        return { status: "pass" as const };
      },
    };
    expect(validateCheck(check, "test plugin")).toBe(check);
  });

  it("reports the id, source, and validation issue", () => {
    expect(() =>
      validateCheck(
        {
          id: "broken-check",
          title: "Broken",
          category: "setup",
          weight: 9,
          why: "It matters.",
          run() {},
        },
        "sample.ts",
      ),
    ).toThrow(
      expect.objectContaining({
        name: "InvalidCheckError",
        message: expect.stringContaining(
          'Invalid check "broken-check" from sample.ts: weight:',
        ),
      }),
    );
    expect(() => validateCheck({}, "plugin")).toThrow(InvalidCheckError);
  });
});
