import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fixPlanSchema } from "@oh-my-otter/core";
import { createCheckContext } from "@oh-my-otter/core/node";
import { builtinChecks } from "../src";
import installDocumented from "../src/checks/install-documented";
import packageManagerLockfile from "../src/checks/package-manager-lockfile";
import testsPass from "../src/checks/tests-pass";
import typecheckScript from "../src/checks/typecheck-script";
import envExample from "../src/checks/env-example";
import gitignoreSane from "../src/checks/gitignore-sane";
import { describe, expect, it } from "vitest";

async function withTempRepo(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "omot-checks-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("targeted checks", () => {
  it("fails when the declared lockfile is missing or mismatched", async () => {
    await withTempRepo(async (root) => {
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ packageManager: "pnpm@10.0.0" }),
      );
      await writeFile(path.join(root, "package-lock.json"), "");
      expect(
        (await packageManagerLockfile.run(createCheckContext(root))).status,
      ).toBe("fail");
    });
  });

  it("warns when multiple lockfiles exist without a declared manager", async () => {
    await withTempRepo(async (root) => {
      await writeFile(path.join(root, "package.json"), "{}");
      await writeFile(path.join(root, "package-lock.json"), "");
      await writeFile(path.join(root, "yarn.lock"), "");
      expect(
        (await packageManagerLockfile.run(createCheckContext(root))).status,
      ).toBe("warn");
    });
  });

  it("marks typecheck as not applicable for a JavaScript-only repository", async () => {
    await withTempRepo(async (root) => {
      await writeFile(path.join(root, "index.js"), "console.log('hi');");
      await writeFile(path.join(root, "package.json"), '{"scripts":{}}');
      expect((await typecheckScript.run(createCheckContext(root))).status).toBe(
        "na",
      );
    });
  });

  it("marks env examples not applicable with no usage or ignored-only usage", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/index.js"),
        "export const ok = true;",
      );
      expect((await envExample.run(createCheckContext(root))).status).toBe(
        "na",
      );
      await writeFile(
        path.join(root, "src/index.js"),
        "console.log(process.env.NODE_ENV);",
      );
      expect((await envExample.run(createCheckContext(root))).status).toBe(
        "na",
      );
    });
  });

  it.each([
    [0, "pass"],
    [1, "fail"],
  ] as const)(
    "runs test scripts with exit code %i",
    async (exitCode, status) => {
      await withTempRepo(async (root) => {
        await writeFile(
          path.join(root, "package.json"),
          JSON.stringify({
            scripts: { test: `node -e "process.exit(${exitCode})"` },
          }),
        );
        expect(
          (await testsPass.run(createCheckContext(root, { allowRun: true })))
            .status,
        ).toBe(status);
      });
    },
  );

  it("warns when README has an installation heading but no command", async () => {
    await withTempRepo(async (root) => {
      await writeFile(
        path.join(root, "README.md"),
        "# Project\n\n## Installation\n",
      );
      expect(
        (await installDocumented.run(createCheckContext(root))).status,
      ).toBe("warn");
    });
  });

  it("warns when .gitignore has dependencies but no build output", async () => {
    await withTempRepo(async (root) => {
      await writeFile(path.join(root, ".gitignore"), "node_modules/\n");
      expect((await gitignoreSane.run(createCheckContext(root))).status).toBe(
        "warn",
      );
    });
  });

  it("returns valid, create-only fixes for the bare fixture", async () => {
    const fixture = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "fixtures/bare",
    );
    const context = createCheckContext(fixture);
    for (const check of builtinChecks) {
      if (!check.fix) continue;
      const plan = await check.fix(context);
      expect(fixPlanSchema.safeParse(plan).success).toBe(true);
      for (const file of plan) {
        expect(await context.exists(file.path)).toBe(false);
      }
    }
  });
});
