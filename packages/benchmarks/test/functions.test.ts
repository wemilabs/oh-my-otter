import { describe, expect, it } from "vitest";
import { findFunctionBody } from "../src/lib/functions";
import { maskNonCode } from "../src/lib/lexer";

describe("findFunctionBody", () => {
  it.each([
    [
      "a typed function declaration",
      "export function target(value: number): number { return value + 1; }",
      "{ return value + 1; }",
    ],
    [
      "an async function declaration",
      "async function target() { await run(); }",
      "{ await run(); }",
    ],
    [
      "an exported default function declaration",
      "export default function target() { return 1; }",
      "{ return 1; }",
    ],
    [
      "a const arrow block",
      "export const target = (value: number) => { return value + 1; };",
      "{ return value + 1; }",
    ],
    [
      "an async typed const arrow",
      "const target = async (value: number): Promise<number> => { return value + 1; };",
      "{ return value + 1; }",
    ],
    [
      "a chained expression-bodied arrow",
      "const target = (value: number): string => value + 1\n  .toString()\n  .trim();",
      "value + 1\n  .toString()\n  .trim()",
    ],
    [
      "a function expression",
      "const target = function(value: number) { return value + 1; };",
      "{ return value + 1; }",
    ],
    [
      "a class method",
      "class Example {\n  public async target(value: number): Promise<number> {\n    return value + 1;\n  }\n}",
      "{\n    return value + 1;\n  }",
    ],
    [
      "a function with an object-literal return type",
      "function target(): { value: number } { return { value: 1 }; }",
      "{ return { value: 1 }; }",
    ],
  ])("finds %s", (_description, source, expected) => {
    const body = findFunctionBody(source, "target");
    expect(body).not.toBeNull();
    expect(source.slice(body!.start, body!.end)).toBe(expected);
  });

  it("skips a method-looking call statement", () => {
    expect(
      findFunctionBody("class Example {\n  target(value);\n}", "target"),
    ).toBeNull();
  });

  it("keeps masked source offsets and lengths", () => {
    const source = 'const x = /}/.test(value) ? `😀` : "no";\n';
    expect(maskNonCode(source)).toHaveLength(source.length);
  });
});
