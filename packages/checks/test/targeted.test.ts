import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fixPlanSchema } from "@oh-my-otter/core";
import { createCheckContext } from "@oh-my-otter/core/node";
import { builtinChecks } from "../src";
import installDocumented from "../src/checks/install-documented";
import nodeVersionPinned from "../src/checks/node-version-pinned";
import packageManagerLockfile from "../src/checks/package-manager-lockfile";
import testScript from "../src/checks/test-script";
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

  it("warns when every existing environment example is gitignored", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(path.join(root, "src/index.js"), "process.env.API_KEY;");
      await writeFile(path.join(root, ".gitignore"), ".env*\n");
      await writeFile(path.join(root, ".env.example"), "API_KEY=\n");

      const context = createCheckContext(root);
      expect(await envExample.run(context)).toMatchObject({
        status: "warn",
        detail: ".env.example is ignored by .gitignore",
        fix: "Add !.env.example to .gitignore so it can be committed.",
      });

      await writeFile(path.join(root, ".gitignore"), ".env*\n!.env.example\n");
      expect((await envExample.run(context)).status).toBe("pass");
    });
  });

  it("uses visible examples instead of keys from ignored examples", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(path.join(root, "src/index.js"), "process.env.API_KEY;");
      await writeFile(path.join(root, ".gitignore"), ".env.sample\n");
      await writeFile(path.join(root, ".env.example"), "PORT=\n");
      await writeFile(path.join(root, ".env.sample"), "API_KEY=\n");

      expect(await envExample.run(createCheckContext(root))).toMatchObject({
        status: "warn",
        detail: ".env.example is missing: API_KEY",
        fix: "Add the missing variable names to .env.example.",
      });
    });
  });

  it("uses the first ignored example name in its remediation", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(path.join(root, "src/index.js"), "process.env.API_KEY;");
      await writeFile(path.join(root, ".gitignore"), ".env*\n");
      await writeFile(path.join(root, ".env.sample"), "API_KEY=\n");

      expect(await envExample.run(createCheckContext(root))).toMatchObject({
        status: "warn",
        detail: ".env.sample is ignored by .gitignore",
        fix: "Add !.env.sample to .gitignore so it can be committed.",
      });
    });
  });

  it("warns after creating an environment example ignored by git", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(path.join(root, "src/index.js"), "process.env.API_KEY;");
      await writeFile(path.join(root, ".gitignore"), ".env*\n");

      const context = createCheckContext(root);
      const plan = await envExample.fix!(context);
      expect(plan[0]?.path).toBe(".env.example");
      await writeFile(path.join(root, ".env.example"), plan[0]?.contents ?? "");

      expect(await envExample.run(context)).toMatchObject({
        status: "warn",
        detail: ".env.example is ignored by .gitignore",
      });
    });
  });

  it("combines missing-variable and gitignore warnings", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/index.js"),
        "process.env.API_KEY;\nprocess.env.SECRET;\n",
      );
      await writeFile(path.join(root, ".gitignore"), ".env*\n");
      await writeFile(path.join(root, ".env.example"), "API_KEY=\n");

      const result = await envExample.run(createCheckContext(root));
      expect(result.status).toBe("warn");
      expect(result.detail).toBe(
        ".env.example is missing: SECRET; .env.example is ignored by .gitignore",
      );
      expect(result.fix).toBe(
        "Add the missing variable names to .env.example. Add !.env.example to .gitignore so it can be committed.",
      );
    });
  });

  it("extracts env keys from object schemas passed a bare process.env", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "lib"));
      await writeFile(
        path.join(root, "lib/env.ts"),
        "const MAP = { FOO_BAR: 1 };\n" +
          'const TEXT = "z.object({ STRING_KEY: z.string() })";\n' +
          "// z.object({ COMMENT_KEY: z.string() })\n" +
          "const envSchema = z.object({ DATABASE_URL: z.string(), NEON_AUTH_BASE_URL: z.string().url(), NODE_ENV: z.enum(['dev', 'prod']) });\n" +
          "export const env = envSchema.parse(process.env);\n",
      );

      const context = createCheckContext(root);
      expect((await envExample.run(context)).status).toBe("fail");
      expect((await envExample.fix!(context))[0]?.contents).toBe(
        "DATABASE_URL=\nNEON_AUTH_BASE_URL=\n",
      );
    });
  });

  it("extracts createEnv server, client, and shared keys but not runtimeEnv", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "lib"));
      await writeFile(
        path.join(root, "lib/env.ts"),
        "createEnv({\n" +
          "  server: { DB_URL: z.string() },\n" +
          "  client: { PUBLIC_KEY: z.string() },\n" +
          "  shared: { SHARED_TOKEN: z.string() },\n" +
          "  runtimeEnv: {\n" +
          "    RAW_RUNTIME_KEY: process.env.RAW_RUNTIME_KEY,\n" +
          "    NOT_A_SCHEMA_KEY: 'ignored',\n" +
          "  },\n" +
          "});\n" +
          "const rawEnv = process.env;\n",
      );

      const context = createCheckContext(root);
      expect((await envExample.run(context)).status).toBe("fail");
      expect((await envExample.fix!(context))[0]?.contents).toBe(
        "DB_URL=\nPUBLIC_KEY=\nRAW_RUNTIME_KEY=\nSHARED_TOKEN=\n",
      );
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
      expect(plan[0]?.contents).toContain("actions/checkout@v7");
      expect(plan[0]?.contents).toContain("pnpm/action-setup@v6");
      expect(plan[0]?.contents).toContain("actions/setup-node@v7");
      expect(plan[0]?.contents).toContain("node-version: 24");
    });

    await withTempRepo(async (root) => {
      await writeFile(path.join(root, "package.json"), "{}");
      await writeFile(
        path.join(root, "pnpm-lock.yaml"),
        "lockfileVersion: '9.0'\n",
      );
      const plan = await ciConfig.fix!(createCheckContext(root));
      expect(plan[0]?.contents).toContain(
        "      - uses: pnpm/action-setup@v6\n        with:\n          version: 12\n",
      );
    });
  });

  it.each([".nvmrc", ".node-version"])(
    "uses an existing %s in generated CI",
    async (file) => {
      await withTempRepo(async (root) => {
        await writeFile(path.join(root, file), "20\n");
        const plan = await ciConfig.fix!(createCheckContext(root));
        expect(plan[0]?.contents).toContain(`node-version-file: ${file}`);
        expect(plan[0]?.contents).not.toContain("node-version: 24");
      });
    },
  );

  it("pins .nvmrc to the shared default Node major", async () => {
    await withTempRepo(async (root) => {
      expect(
        (await nodeVersionPinned.fix!(createCheckContext(root)))[0],
      ).toEqual({ path: ".nvmrc", contents: "24\n" });
    });
  });

  it("warns when test-specific scripts exist without scripts.test", async () => {
    await withTempRepo(async (root) => {
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          scripts: {
            "test:unit": "vitest run",
            "test:e2e": "playwright test",
          },
        }),
      );

      expect(await testScript.run(createCheckContext(root))).toEqual({
        status: "warn",
        detail: "No scripts.test; found test:e2e, test:unit.",
        fix: "Add a scripts.test that runs the main test suite.",
      });
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

  it.each([
    "## Installation\n\nRun `npx drizzle-kit generate`.\n",
    "## Installation\n\nWe use yarn for package management.\n",
    "## Installation\n\nWe use yarn workspaces for package management.\n",
    "## Installation\n\n```sh\ncorepack enable\n```\n",
  ])(
    "does not treat non-install mentions as install commands",
    async (readme) => {
      await withTempRepo(async (root) => {
        await writeFile(path.join(root, "README.md"), readme);
        expect(
          (await installDocumented.run(createCheckContext(root))).status,
        ).toBe("warn");
      });
    },
  );

  it("closes CRLF code fences before reading prose", async () => {
    await withTempRepo(async (root) => {
      await writeFile(
        path.join(root, "README.md"),
        "## Installation\r\n\r\n```sh\r\ncorepack enable\r\n```\r\n\r\nyarn\r\n",
      );
      expect(
        (await installDocumented.run(createCheckContext(root))).status,
      ).toBe("warn");
    });
  });

  it.each([
    "pnpm install",
    "npm ci",
    "bun add example",
    "yarn",
    "$ yarn",
    "yarn install --frozen-lockfile",
    "Run `yarn install` to set up",
    "run yarn install first",
    "corepack enable\npnpm install",
  ])("recognizes install command %s", async (command) => {
    await withTempRepo(async (root) => {
      await writeFile(
        path.join(root, "README.md"),
        `## Installation\n\n\`\`\`sh\n${command}\n\`\`\`\n`,
      );
      expect(
        (await installDocumented.run(createCheckContext(root))).status,
      ).toBe("pass");
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

  it("extracts env keys from Joi.object schemas", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/env.js"),
        "const schema = Joi.object({ DATABASE_URL: Joi.string().required(), PORT: Joi.number() }); schema.validate(process.env);\n",
      );
      await writeFile(path.join(root, ".env.example"), "PORT=\n");

      const result = await envExample.run(createCheckContext(root));
      expect(result.status).toBe("warn");
      expect(result.detail).toBe(".env.example is missing: DATABASE_URL");
    });
  });

  it("extracts env keys from Joi.object().keys() schemas", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/env.js"),
        "const schema = Joi.object().keys({ DATABASE_URL: Joi.string().required(), PORT: Joi.number() }); schema.validate(process.env);\n",
      );
      await writeFile(path.join(root, ".env.example"), "PORT=\n");

      const result = await envExample.run(createCheckContext(root));
      expect(result.status).toBe("warn");
      expect(result.detail).toBe(".env.example is missing: DATABASE_URL");
    });
  });

  it("ignores Joi schemas without a bare process.env reference", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/env.js"),
        "const schema = Joi.object({ API_KEY: Joi.string() }); schema.validate(body);\n",
      );
      await writeFile(path.join(root, ".env.example"), "PORT=\n");

      expect((await envExample.run(createCheckContext(root))).status).toBe(
        "na",
      );
    });
  });

  it("extracts schema env keys inside template interpolations", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/env.js"),
        "const text = `${z.object({ DATABASE_URL: z.string() }).parse(process.env)}`;\n",
      );
      await writeFile(path.join(root, ".env.example"), "PORT=\n");

      const result = await envExample.run(createCheckContext(root));
      expect(result.status).toBe("warn");
      expect(result.detail).toBe(".env.example is missing: DATABASE_URL");
    });
  });

  it("extracts schema env keys past nested templates and brace strings", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/env.js"),
        'const t = `a ${`b ${"}"}`} ${z.object({ API_URL: z.string() }).parse(process.env)}`;\n',
      );
      await writeFile(path.join(root, ".env.example"), "PORT=\n");

      const result = await envExample.run(createCheckContext(root));
      expect(result.status).toBe("warn");
      expect(result.detail).toBe(".env.example is missing: API_URL");
    });
  });

  it("extracts schema env keys after a regex with a brace in its class", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/env.js"),
        "const text = `${/[}]/.test(input) ? z.object({ DATABASE_URL: z.string() }).parse(process.env) : ''}`;\n",
      );
      await writeFile(path.join(root, ".env.example"), "PORT=\n");

      const result = await envExample.run(createCheckContext(root));
      expect(result.status).toBe("warn");
      expect(result.detail).toBe(".env.example is missing: DATABASE_URL");
    });
  });

  it("ignores braces in top-level regex literals before schemas", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/env.js"),
        "const re = /[{]/;\nconst env = z.object({ API_URL: z.string() }).parse(process.env);\n",
      );
      await writeFile(path.join(root, ".env.example"), "PORT=\n");

      const result = await envExample.run(createCheckContext(root));
      expect(result.status).toBe("warn");
      expect(result.detail).toBe(".env.example is missing: API_URL");
    });
  });

  it("does not treat JSX closing tags as regex literals", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/env.jsx"),
        "const el = <div><b>{a}</b>{z.object({ API_URL: z.string() }).parse(process.env)}</div>;\n",
      );
      await writeFile(path.join(root, ".env.example"), "PORT=\n");

      const result = await envExample.run(createCheckContext(root));
      expect(result.status).toBe("warn");
      expect(result.detail).toBe(".env.example is missing: API_URL");
    });
  });

  it("does not treat JSX self-closing tags as regex literals", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/env.jsx"),
        "const el = <div><Field value={x} /><p>{z.object({ API_URL: z.string() }).parse(process.env)}</p></div>;\n",
      );
      await writeFile(path.join(root, ".env.example"), "PORT=\n");

      const result = await envExample.run(createCheckContext(root));
      expect(result.status).toBe("warn");
      expect(result.detail).toBe(".env.example is missing: API_URL");
    });
  });

  it("keeps a regex literal after an open paren when it contains />", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/env.js"),
        'const t = `${x.replace(/>}/g, "")} ${z.object({ API_KEY: z.string() }).parse(process.env)}`;\n',
      );
      await writeFile(path.join(root, ".env.example"), "PORT=\n");

      const result = await envExample.run(createCheckContext(root));
      expect(result.status).toBe("warn");
      expect(result.detail).toBe(".env.example is missing: API_KEY");
    });
  });

  it("treats slashes after values as division, not regex starts", async () => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src/env.js"),
        "const t = `${total / count} ${z.object({ API_KEY: z.string() }).parse(process.env)}`;\nconst r = (a) / 2 / (b);\n",
      );
      await writeFile(path.join(root, ".env.example"), "PORT=\n");

      const result = await envExample.run(createCheckContext(root));
      expect(result.status).toBe("warn");
      expect(result.detail).toBe(".env.example is missing: API_KEY");
    });
  });

  it.each([
    "consume(process.env);\nconst doc = `z.object({ SECRET_TOKEN: z.string() })`;\n",
    'consume(process.env);\nconst doc = "z.object({ SECRET_TOKEN: z.string() })";\n',
    "consume(process.env);\nconst name = 'x';\nconst s = `${name} z.object({ SECRET_TOKEN: 1 })`;\n",
    "consume(process.env);\nconst re = /z.object({ SECRET_TOKEN: 1 })/;\n",
  ])("ignores schema text that is not code: %s", async (source) => {
    await withTempRepo(async (root) => {
      await mkdir(path.join(root, "src"));
      await writeFile(path.join(root, "src/env.js"), source);
      await writeFile(path.join(root, ".env.example"), "PORT=\n");

      expect((await envExample.run(createCheckContext(root))).status).toBe(
        "pass",
      );
    });
  });

  it.each([
    "## Installation\n\nWe use `yarn` workspaces. See the team for setup details.\n",
    "## Setup\n\nThis repo uses `npx` scripts and `pnpm`.\n",
    "## Installation\n\nwe use yarn\n",
    "## Installation\n\nWe use pnpm and npx scripts.\n",
    "## Installation\n\n<pre># npm install</pre>\n",
    "## Installation\n\n<!-- npm install -->\n",
    "## Installation\n\n<!-- <pre>npm install</pre> -->\n",
    "## Installation\n\n```sh\nyarn --version\n```\n",
    "## Installation\n\n```sh\nyarn -v\n```\n",
    "## Installation\n\n```sh\n# npm install\n```\n",
    "## Installation\n\n    # pnpm install\n",
  ])("warns when install commands only appear in prose: %s", async (readme) => {
    await withTempRepo(async (root) => {
      await writeFile(path.join(root, "README.md"), readme);
      expect(
        (await installDocumented.run(createCheckContext(root))).status,
      ).toBe("warn");
    });
  });

  it.each([
    "## Installation\n\nRun `pnpm install` to set up dependencies.\n",
    "## Installation\n\nRun `yarn` in the repo root.\n",
    "## Installation\n\nRun `npm ci`.\n",
    "## Installation\n\n    pnpm install\n",
    "## Installation\n\n~~~bash\n$ bun install\n~~~\n",
    "## Installation\n\n<pre>yarn install</pre>\n",
    "## Installation\n\n```sh\ncd app && yarn\n```\n",
    "## Installation\n\n```sh\nnpm install # deps\n```\n",
    "## Installation\n\n```sh\nyarn --frozen-lockfile\n```\n",
    '## Installation\n\n```sh\ncd "project #1" && npm install\n```\n',
    "## Installation\n\n```sh\ncd 'a#b' && pnpm install\n```\n",
  ])("recognizes install commands in code: %s", async (readme) => {
    await withTempRepo(async (root) => {
      await writeFile(path.join(root, "README.md"), readme);
      expect(
        (await installDocumented.run(createCheckContext(root))).status,
      ).toBe("pass");
    });
  });

  it.each([
    "## Installation\n\nRun pnpm install first.\n",
    "## Installation\n\nRun pnpm install to set up.\n",
    "## Setup\n\nInstall dependencies with npm ci, then build.\n",
  ])("recognizes install commands in prose: %s", async (readme) => {
    await withTempRepo(async (root) => {
      await writeFile(path.join(root, "README.md"), readme);
      expect(
        (await installDocumented.run(createCheckContext(root))).status,
      ).toBe("pass");
    });
  });

  it.each([
    ["pass", "## Installation\n\nStep #1: run yarn install\n"],
    ["warn", "## Installation\n\n# npm install\n"],
  ] as const)(
    "returns %s for a plain-text README line: %s",
    async (status, readme) => {
      await withTempRepo(async (root) => {
        await writeFile(path.join(root, "README.txt"), readme);
        expect(
          (await installDocumented.run(createCheckContext(root))).status,
        ).toBe(status);
      });
    },
  );

  it("accepts a line-start install command in a plain-text README", async () => {
    await withTempRepo(async (root) => {
      await writeFile(
        path.join(root, "README.txt"),
        "## Installation\n\nInstallation\n\nnpm install\n",
      );
      expect(
        (await installDocumented.run(createCheckContext(root))).status,
      ).toBe("pass");
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
