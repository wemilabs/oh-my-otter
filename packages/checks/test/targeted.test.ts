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
import ciConfig from "../src/checks/ci-config";
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

  it("warns when an existing environment example omits used variables", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/index.js"),
        "process.env.ZED;\nprocess.env.API_KEY;\n",
      );
      await writeFile(path.join(root, ".env.example"), "# DOCUMENTED=\n");

      const result = await envExample.run(createCheckContext(root));
      expect(result.status).toBe("warn");
      expect(result.detail).toBe(".env.example is missing: API_KEY, ZED");
      expect(result.fix).toBe(
        "Add the missing variable names to .env.example.",
      );
      expect(await envExample.fix!(createCheckContext(root))).toEqual([]);
    });
  });

  it("counts commented and exported example keys as documented", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/index.js"),
        "process.env.ALPHA;\nprocess.env.BETA;\n",
      );
      await writeFile(
        path.join(root, ".env.example"),
        "# ALPHA=\nexport BETA=\n",
      );

      expect((await envExample.run(createCheckContext(root))).status).toBe(
        "pass",
      );
    });
  });

  it("unions documented keys from all existing environment examples", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/index.js"),
        "process.env.PORT;\nprocess.env.API_KEY;\n",
      );
      await writeFile(path.join(root, ".env.example"), "PORT=\n");
      await writeFile(path.join(root, ".env.sample"), "API_KEY=\n");

      expect((await envExample.run(createCheckContext(root))).status).toBe(
        "pass",
      );
    });
  });

  it("excludes platform-injected variables from warnings and fixes", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      const injected = [
        "CI",
        "HOME",
        "PATH",
        "PWD",
        "USER",
        "SHELL",
        "TERM",
        "TZ",
        "LANG",
        "NEXT_RUNTIME",
        "VERCEL",
        "VERCEL_ENV",
        "VERCEL_URL",
        "VERCEL_BRANCH_URL",
        "VERCEL_PROJECT_PRODUCTION_URL",
        "VERCEL_REGION",
        "VERCEL_DEPLOYMENT_ID",
        "NETLIFY",
        "NETLIFY_DEV",
        "GITHUB_ACTIONS",
        "GITHUB_SHA",
        "GITHUB_REF",
        "GITHUB_REF_NAME",
        "GITHUB_HEAD_REF",
        "GITHUB_BASE_REF",
        "GITHUB_RUN_ID",
        "GITHUB_RUN_NUMBER",
        "GITHUB_WORKSPACE",
        "GITHUB_REPOSITORY",
        "GITHUB_EVENT_NAME",
        "GITHUB_SERVER_URL",
        "GITHUB_OUTPUT",
        "GITHUB_ENV",
        "GITHUB_STEP_SUMMARY",
        "VERCEL_GIT_COMMIT_SHA",
        "RUNNER_OS",
        "npm_config_user_agent",
      ];
      await writeFile(
        path.join(root, "src/index.js"),
        [...injected, "API_KEY"]
          .map((name) => `process.env.${name};`)
          .join("\n"),
      );
      const context = createCheckContext(root);

      expect((await envExample.fix!(context))[0]?.contents).toBe("API_KEY=\n");
      await writeFile(path.join(root, ".env.example"), "API_KEY=\n");
      expect((await envExample.run(context)).status).toBe("pass");
    });
  });

  it.each(["NETLIFY_AUTH_TOKEN", "GITHUB_CLIENT_SECRET", "VERCEL_TOKEN"])(
    "warns when user-supplied variable %s is undocumented",
    async (name) => {
      await withTempRepo(async (root) => {
        await mkdir(path.join(root, "src"));
        await writeFile(
          path.join(root, "src/index.js"),
          `process.env.${name};`,
        );
        await writeFile(path.join(root, ".env.example"), "");

        const result = await envExample.run(createCheckContext(root));
        expect(result.status).toBe("warn");
        expect(result.detail).toBe(`.env.example is missing: ${name}`);
      });
    },
  );

  it.each(["VERCEL_URL", "GITHUB_SHA"])(
    "does not warn for platform-injected variable %s",
    async (name) => {
      await withTempRepo(async (root) => {
        await mkdir(path.join(root, "src"));
        await writeFile(
          path.join(root, "src/index.js"),
          `process.env.${name};`,
        );

        expect((await envExample.run(createCheckContext(root))).status).toBe(
          "na",
        );
      });
    },
  );

  it("collects named destructured environment variables", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/index.js"),
        "const { API_URL, TOKEN: authToken, NODE_ENV, ...rest } = process.env;\n" +
          "const { PUBLIC_KEY: value } = import.meta.env;\n",
      );
      const context = createCheckContext(root);

      expect((await envExample.run(context)).status).toBe("fail");
      expect((await envExample.fix!(context))[0]?.contents).toBe(
        "API_URL=\nPUBLIC_KEY=\nTOKEN=\n",
      );
    });
  });

  it.each(["consume(process.env);", "consume(import.meta.env);"])(
    "counts a bare %s reference as usage without inventing names",
    async (source) => {
      await withTempRepo(async (root) => {
        await mkdir(path.join(root, "src"));
        await writeFile(path.join(root, "src/index.js"), source);
        const context = createCheckContext(root);

        expect((await envExample.run(context)).status).toBe("fail");
        expect((await envExample.fix!(context))[0]?.contents).toBe("");
      });
    },
  );

  it.each([
    "const { ...config } = process.env;",
    "const { ...config } = import.meta.env;",
  ])(
    "counts rest-only destructuring as environment usage: %s",
    async (source) => {
      await withTempRepo(async (root) => {
        await mkdir(path.join(root, "src"));
        await writeFile(path.join(root, "src/index.js"), source);
        const context = createCheckContext(root);

        expect((await envExample.run(context)).status).toBe("fail");
        expect((await envExample.fix!(context))[0]?.contents).toBe("");
      });
    },
  );

  it("adds a pnpm setup version only when packageManager is absent", async () => {
    await withTempRepo(async (root) => {
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ packageManager: "pnpm@10.1.0" }),
      );
      const plan = await ciConfig.fix!(createCheckContext(root));
      expect(plan[0]?.contents).not.toContain("version: 12");
    });

    await withTempRepo(async (root) => {
      await writeFile(path.join(root, "package.json"), "{}");
      await writeFile(
        path.join(root, "pnpm-lock.yaml"),
        "lockfileVersion: '9.0'\n",
      );
      const plan = await ciConfig.fix!(createCheckContext(root));
      expect(plan[0]?.contents).toContain(
        "      - uses: pnpm/action-setup@v4\n        with:\n          version: 12\n",
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

  it("keeps root node_modules ignored by a nested negation", async () => {
    await withTempRepo(async (root) => {
      await writeFile(
        path.join(root, ".gitignore"),
        "node_modules/\n!packages/demo/node_modules/\ndist\n",
      );
      expect((await gitignoreSane.run(createCheckContext(root))).status).toBe(
        "pass",
      );
    });
  });

  it.each(["!node_modules", "!/node_modules/", "!**/node_modules"])(
    "lets a root-level .gitignore negation un-ignore node_modules: %s",
    async (negation) => {
      await withTempRepo(async (root) => {
        await writeFile(
          path.join(root, ".gitignore"),
          `node_modules/\n${negation}\ndist\n`,
        );
        const result = await gitignoreSane.run(createCheckContext(root));
        expect(result.status).toBe("warn");
        expect(result.detail).toContain("node_modules");
      });
    },
  );

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
