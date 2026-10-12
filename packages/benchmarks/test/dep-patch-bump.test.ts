import { describe, expect, it } from "vitest";
import task, {
  compatibilityLine,
  lockfileVersions,
} from "../src/tasks/dep-patch-bump/verify";
import {
  failingTest,
  npmPackage,
  passingTest,
  startTask,
  verifyTask,
  type Files,
} from "./helpers";

const scripts = { build: "node build.mjs", test: "node --test" };

function pkg(leftPad: string, isOdd = "^3.0.0"): string {
  return npmPackage(scripts, {
    dependencies: { "left-pad": leftPad },
    devDependencies: { "is-odd": isOdd },
  });
}

function lock(leftPad: string, isOdd = "3.0.1"): string {
  return `${JSON.stringify(
    {
      name: "fixture",
      lockfileVersion: 3,
      packages: {
        "node_modules/left-pad": { version: leftPad },
        "node_modules/is-odd": { version: isOdd },
      },
    },
    null,
    2,
  )}\n`;
}

const base: Files = {
  "package.json": pkg("^1.1.0"),
  "package-lock.json": lock("1.1.0"),
  "build.mjs": "console.log('built');\n",
  "test/ok.test.mjs": passingTest,
};
const params = { package: "left-pad" };

describe("dep-patch-bump", () => {
  it("passes when the package is bumped within its major and checks pass", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^1.3.0"),
      "package-lock.json": lock("1.3.0"),
    });
    expect(result.outcome).toBe("pass");
    expect(result.reasons).toContain("Lockfile updated for left-pad.");
  });

  it("is partial when tests fail or other dependencies change", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^1.3.0", "^3.1.0"),
      "package-lock.json": lock("1.3.0", "3.1.0"),
      "test/ok.test.mjs": failingTest,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons.join("\n")).toMatch(
      /Other dependencies changed.*is-odd/,
    );
    expect(result.reasons.join("\n")).toMatch(/test script failed/);
  });

  it("fails on a major bump", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^2.0.0"),
      "package-lock.json": lock("2.0.0"),
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons.join("\n")).toMatch(/new major version/);
  });

  it("fails when the lockfile was not updated", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {});
    expect(result.outcome).toBe("fail");
  });

  it("rejects packages that are not declared", async () => {
    await expect(startTask(task, base, { package: "react" })).rejects.toThrow(
      /not declared/,
    );
  });

  it.each([
    ["^1.2.3", "1"],
    ["~0.4.1", "0.4"],
    ["0.x", "0"],
    ["npm:other@^2.1.0", "2"],
    [">=3 <4", "3"],
    ["latest", null],
  ])("compatibility line of %s is %s", (spec, line) => {
    expect(compatibilityLine(spec)).toBe(line);
  });
});

describe("lockfileVersions", () => {
  it("reads resolved versions from pnpm, yarn, and bun lockfiles", () => {
    const pnpm = `packages:\n  zod@4.1.0:\n    resolution: {}\n  eslint-config-zod@1.0.0:\n  '@x/zod@9.9.9':\n`;
    expect(lockfileVersions(pnpm, "zod")).toEqual(["4.1.0"]);
    const yarn = `"zod@^4.0.0":\n  version "4.1.2"\n  resolved "x"\n\nzod-extra@^1.0.0:\n  version "1.0.0"\n`;
    expect(lockfileVersions(yarn, "zod")).toEqual(["4.1.2"]);
    const bun = `{ "packages": { "zod": ["zod@4.1.3", "", {}] } }`;
    expect(lockfileVersions(bun, "zod")).toEqual(["4.1.3"]);
    expect(lockfileVersions("  /zod@4.1.4:\n  /zod/4.1.5:\n", "zod")).toEqual([
      "4.1.4",
      "4.1.5",
    ]);
    expect(
      lockfileVersions("  zod-extra@1.0.0:\n  /@x/zod/9.9.9:\n", "zod"),
    ).toEqual([]);
    expect(
      lockfileVersions("  '@types/node@22.1.0':\n", "@types/node"),
    ).toEqual(["22.1.0"]);
  });
});
