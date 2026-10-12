import { describe, expect, it } from "vitest";
import { outputTail } from "../src/lib/scripts";
import type { CommandResult } from "../src/types";

describe("script output", () => {
  it("strips ANSI escapes, trims lines, and limits the tail to 15 lines", () => {
    const result: CommandResult = {
      code: 1,
      stdout: "",
      stderr: "",
      output: `\u001b[31mline 0\u001b[0m\n${Array.from(
        { length: 20 },
        (_, index) => ` line ${index + 1} `,
      ).join("\n")}\n`,
      timedOut: false,
    };
    const tail = outputTail(result);
    expect(tail).toHaveLength(15);
    expect(tail[0]).toBe("line 6");
    expect(tail.at(-1)).toBe("line 20");
    expect(tail.join("\n")).not.toContain("\u001b");
  });
});
