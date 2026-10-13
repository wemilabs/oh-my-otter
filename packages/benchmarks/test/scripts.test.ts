import { describe, expect, it } from "vitest";
import { outputTail, redactSecrets } from "../src/lib/scripts";
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

  it.each([
    ["API_TOKEN=top-secret", "API_TOKEN=[redacted]"],
    ["password: 'open sesame'", "password: [redacted]"],
    ["Bearer abcdefgh1234", "Bearer [redacted]"],
    ["Basic dXNlcjpwYXNzMTIz", "Basic [redacted]"],
    ["https://alice:hunter2@example.com/a", "https://[redacted]@example.com/a"],
    ["ghp_AAAAAAAAAAAAAAAAAAAA", "[redacted]"],
    ["github_pat_AAAAAAAAAAAAAAAAAAAA", "[redacted]"],
    ["sk-abcdefghijklmnopqrst", "[redacted]"],
    ["xoxb-1234567890", "[redacted]"],
    ["AKIA1234567890ABCDEF", "[redacted]"],
    [`npm_${"a".repeat(30)}`, "[redacted]"],
    ["eyJabcdefghij.eyJabcdefghij.eyJabcdefghij", "[redacted]"],
    [
      "-----BEGIN RSA PRIVATE KEY----- secret material",
      "[redacted private key]",
    ],
  ])("redacts secrets in %s", (line, expected) => {
    expect(redactSecrets(line)).toBe(expected);
  });

  it.each([
    "SyntaxError: Unexpected token: }",
    "packages/benchmarks/test/scripts.test.ts",
    "https://example.com/a",
  ])("leaves non-secret text unchanged: %s", (line) => {
    expect(redactSecrets(line)).toBe(line);
  });

  it("redacts output before limiting each line", () => {
    const result: CommandResult = {
      code: 1,
      stdout: "",
      stderr: "",
      output: "TOKEN=secret-value\n",
      timedOut: false,
    };
    expect(outputTail(result)).toEqual(["TOKEN=[redacted]"]);
  });

  it("collapses private-key blocks before selecting tail lines", () => {
    const result: CommandResult = {
      code: 1,
      stdout: "",
      stderr: "",
      output: [
        "before key",
        "-----BEGIN RSA PRIVATE KEY-----",
        "base64-body-one",
        "base64-body-two",
        "-----END RSA PRIVATE KEY-----",
        "after key",
      ].join("\n"),
      timedOut: false,
    };
    expect(outputTail(result, 5)).toEqual([
      "before key",
      "[redacted private key]",
      "after key",
    ]);
  });

  it("redacts an unterminated private-key block through the end", () => {
    const result: CommandResult = {
      code: 1,
      stdout: "",
      stderr: "",
      output: [
        "before key",
        "-----BEGIN RSA PRIVATE KEY-----",
        "base64-body-one",
        "base64-body-two",
      ].join("\n"),
      timedOut: false,
    };
    expect(outputTail(result)).toEqual([
      "before key",
      "[redacted private key]",
    ]);
  });
});
