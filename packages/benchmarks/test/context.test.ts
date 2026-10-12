import { describe, expect, it } from "vitest";
import { createPrepareContext } from "../src/context";
import { createRepo, npmPackage } from "./helpers";

describe("prepare context scripts", () => {
  it("records combined command output on failures and memoizes baseline scripts", async () => {
    const root = await createRepo({
      "package.json": npmPackage({
        test: `node -e "console.log('stdout line'); console.error('stderr line'); process.exit(2)"`,
      }),
    });
    const logs: string[] = [];
    const ctx = createPrepareContext(root, {
      scripts: ["test", "missing"],
      log: (message) => logs.push(message),
    });

    const [first, second] = await Promise.all([
      ctx.recordBaseline(),
      ctx.recordBaseline(),
    ]);

    expect(first).toBe(second);
    const output = first?.test?.output ?? "";
    expect(first?.test).toMatchObject({
      code: 2,
      stdout: expect.stringContaining("stdout line"),
      stderr: expect.stringContaining("stderr line"),
      output: expect.stringContaining("stdout line"),
      timedOut: false,
    });
    expect(output).toContain("stderr line");
    expect(output.indexOf("stdout line")).toBeLessThan(
      output.indexOf("stderr line"),
    );
    expect(logs).toEqual(["Running test at the baseline..."]);
  });

  it("retains combined output when a baseline script times out", async () => {
    const root = await createRepo({
      "package.json": npmPackage({
        test: `node -e "console.log('before timeout'); setTimeout(() => {}, 5000)"`,
      }),
    });
    const ctx = createPrepareContext(root, {
      scripts: ["test"],
      timeoutMs: 1_000,
    });
    const baseline = await ctx.recordBaseline();
    expect(baseline?.test?.timedOut).toBe(true);
    expect(baseline?.test?.output).toContain("before timeout");
  });

  it("returns null when baseline scripts are skipped", async () => {
    const root = await createRepo({
      "package.json": npmPackage({ test: "node --test" }),
    });
    const ctx = createPrepareContext(root, {
      scripts: ["test"],
      skipBaselineScripts: true,
    });
    await expect(ctx.recordBaseline()).resolves.toBeNull();
  });
});
