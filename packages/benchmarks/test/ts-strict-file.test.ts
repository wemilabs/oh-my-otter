import { describe, expect, it } from "vitest";
import { countExplicitAny, countTypeSuppressions } from "../src/lib/lexer";
import task from "../src/tasks/ts-strict-file/verify";
import { npmPackage, startTask, verifyTask, type Files } from "./helpers";

const tsconfig = `${JSON.stringify(
  {
    compilerOptions: {
      strict: true,
      noEmit: true,
      types: [],
      skipLibCheck: true,
      target: "es2022",
      module: "esnext",
      moduleResolution: "bundler",
    },
    include: ["src"],
  },
  null,
  2,
)}\n`;
const base: Files = {
  "package.json": npmPackage({}),
  "package-lock.json": "{}\n",
  "tsconfig.json": tsconfig,
  "src/util.ts":
    "export function parse(input: any): any {\n  return input;\n}\n// any in a comment\nexport const label = 'any';\n",
};
const params = { file: "src/util.ts" };

describe("ts-strict-file", () => {
  it("passes when all any are replaced and typecheck passes", async () => {
    const started = await startTask(task, base, params);
    expect(started.data).toEqual({ any: 2, suppressions: 0 });
    const result = await verifyTask(task, started, params, {
      "src/util.ts":
        "export function parse(input: unknown): unknown {\n  return input;\n}\n",
    });
    expect(result).toEqual({
      outcome: "pass",
      reasons: ["Explicit any in src/util.ts: 2 → 0.", "typecheck passed."],
    });
  });

  it("is partial when some any remain", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "src/util.ts":
        "export function parse(input: unknown): any {\n  return input;\n}\n",
    });
    expect(result.outcome).toBe("partial");
  });

  it("is partial when typecheck fails", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "src/util.ts": 'export const value: number = "nope";\n',
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons.join("\n")).toMatch(/typecheck failed/);
  });

  it("fails when the file is unchanged or deleted", async () => {
    const started = await startTask(task, base, params);
    expect((await verifyTask(task, started, params, {})).outcome).toBe("fail");
    const deleted = await verifyTask(task, started, params, {
      "src/util.ts": null,
    });
    expect(deleted).toEqual({
      outcome: "fail",
      reasons: ["src/util.ts was deleted."],
    });
  });

  it("counts explicit any lexically", () => {
    expect(countExplicitAny("let a: any = 1;")).toBe(1);
    expect(countExplicitAny("type Handler = () => any;")).toBe(1);
    expect(countExplicitAny("const xs: any[] = [];")).toBe(1);
    expect(countExplicitAny("type T = Record<string, any>;")).toBe(1);
    expect(
      countExplicitAny("function f(x: unknown) { return x as any; }"),
    ).toBe(1);
    expect(countExplicitAny("type U = string | any;")).toBe(1);
    expect(
      countExplicitAny("const any = 1; const o = { any: 2 }; o.any;"),
    ).toBe(0);
    expect(
      countExplicitAny("// any\nconst s = 'any'; const t = `any ${1}`;"),
    ).toBe(0);
    expect(countExplicitAny("const many: anything = company;")).toBe(0);
    expect(countTypeSuppressions("// @ts-ignore\n// @ts-expect-error")).toBe(2);
  });
});
