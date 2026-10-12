import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as registry from "../src/registry";
import { builtinChecks } from "../src";
import { validateCheck } from "@oh-my-otter/core";
import { describe, expect, it } from "vitest";

const sourceDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/checks",
);

describe("built-in check registry", () => {
  it("has exactly 14 checks with unique ids", () => {
    expect(builtinChecks).toHaveLength(14);
    expect(new Set(builtinChecks.map((check) => check.id)).size).toBe(14);
  });

  it("validates every check", () => {
    for (const check of builtinChecks) {
      expect(validateCheck(check, "built-in registry")).toBe(check);
    }
  });

  it("exports every check file and matches its id to its filename", async () => {
    const files = (await readdir(sourceDirectory))
      .filter((file) => file.endsWith(".ts"))
      .sort();
    const exported = Object.values(registry);
    expect(exported).toHaveLength(files.length);
    for (const file of files) {
      const id = file.slice(0, -3);
      expect(exported.some((check) => check.id === id)).toBe(true);
    }
  });
});
