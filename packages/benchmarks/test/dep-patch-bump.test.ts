import { symlink } from "node:fs/promises";
import path from "node:path";
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
  writeFiles,
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
        "": { dependencies: { "left-pad": `^${leftPad}` } },
        "node_modules/left-pad": { version: leftPad },
        "node_modules/is-odd": { version: isOdd },
      },
    },
    null,
    2,
  )}\n`;
}

function installed(version: string): Files {
  return {
    "node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version })}\n`,
  };
}

const base: Files = {
  ".gitignore": "node_modules/\n",
  "package.json": pkg("^1.1.0"),
  "package-lock.json": lock("1.1.0"),
  ...installed("1.1.0"),
  "build.mjs": "console.log('built');\n",
  "test/ok.test.mjs": passingTest,
};
const params = { package: "left-pad" };

function pnpmLock(leftPad: string): string {
  return `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      left-pad:
        specifier: ^${leftPad}
        version: ${leftPad}

packages:
  left-pad@${leftPad}:
    resolution: {}
`;
}

const pnpmBase: Files = {
  ".gitignore": "node_modules/\n",
  "package.json": npmPackage(
    {},
    {
      packageManager: "pnpm@9.15.0",
      dependencies: { "left-pad": "^1.1.0" },
    },
  ),
  "pnpm-lock.yaml": pnpmLock("1.1.0"),
};

function pnpmImporters(
  specifiers: Record<string, string>,
  versions: Record<string, string>,
  packages: string[],
): string {
  const importers = Object.keys(specifiers)
    .map(
      (importer) => `  ${importer}:
    dependencies:
      left-pad:
        specifier: ${specifiers[importer]}
        version: ${versions[importer]}
`,
    )
    .join("\n");
  const store = packages
    .map((version) => `  left-pad@${version}:\n    resolution: {}\n`)
    .join("");
  return `lockfileVersion: '9.0'\n\nimporters:\n\n${importers}\npackages:\n${store}`;
}

function pnpmManifest(leftPad: string): string {
  return npmPackage(
    {},
    {
      packageManager: "pnpm@9.15.0",
      dependencies: { "left-pad": leftPad },
    },
  );
}

async function linkStore(root: string, version: string): Promise<void> {
  const store = `node_modules/.pnpm/left-pad@${version}/node_modules/left-pad`;
  await writeFiles(root, {
    [`${store}/package.json`]: `${JSON.stringify({ name: "left-pad", version })}\n`,
  });
  await symlink(
    path.resolve(root, store),
    path.join(root, "node_modules", "left-pad"),
    "junction",
  );
}

describe("dep-patch-bump", () => {
  it("passes when the package is bumped within its major and checks pass", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^1.3.0"),
      "package-lock.json": lock("1.3.0"),
      ...installed("1.3.0"),
    });
    expect(result.outcome).toBe("pass");
    expect(result.reasons).toContain("Lockfile updated for left-pad.");
    expect(result.reasons).toContain(
      "Installed left-pad 1.3.0 matches the lockfile.",
    );
  });

  it("is partial when the bumped version was never installed", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^1.3.0"),
      "package-lock.json": lock("1.3.0"),
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "node_modules has left-pad 1.1.0 but the lockfile says 1.3.0; the bump was never installed (a clean install may reject it).",
    );
    expect(result.reasons.join("\n")).toContain("build script passed.");
    expect(result.reasons.join("\n")).toContain("test script passed.");
  });

  it("still checks the install when a Plug'n'Play file appears after start", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^1.3.0"),
      "package-lock.json": lock("1.3.0"),
      ".pnp.cjs": "module.exports = {};\n",
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "node_modules has left-pad 1.1.0 but the lockfile says 1.3.0; the bump was never installed (a clean install may reject it).",
    );
  });

  it("skips the install check for a Plug'n'Play repository", async () => {
    const started = await startTask(
      task,
      { ...base, ".pnp.cjs": "module.exports = {};\n" },
      params,
    );
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^1.3.0"),
      "package-lock.json": lock("1.3.0"),
    });
    expect(result.outcome).toBe("pass");
    expect(result.reasons).toContain(
      "Yarn Plug'n'Play install; installed left-pad version not checked.",
    );
  });

  it("is partial when the package is missing from node_modules", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^1.3.0"),
      "package-lock.json": lock("1.3.0"),
      "node_modules/left-pad/package.json": null,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "left-pad is not installed in node_modules (resolved from the repo root); the bump was never installed (a clean install may reject it).",
    );
  });

  it("follows pnpm symlinks into the virtual store", async () => {
    const started = await startTask(task, pnpmBase, params);
    await linkStore(started.root, "1.3.0");
    const result = await verifyTask(task, started, params, {
      "package.json": pnpmManifest("^1.3.0"),
      "pnpm-lock.yaml": pnpmLock("1.3.0"),
    });
    expect(result.outcome).toBe("pass");
    expect(result.reasons).toContain(
      "Installed left-pad 1.3.0 matches the lockfile.",
    );
  });

  it("is partial when the pnpm store still holds the old version", async () => {
    const started = await startTask(task, pnpmBase, params);
    await linkStore(started.root, "1.1.0");
    const result = await verifyTask(task, started, params, {
      "package.json": pnpmManifest("^1.3.0"),
      "pnpm-lock.yaml": pnpmLock("1.3.0"),
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "node_modules has left-pad 1.1.0 but the lockfile says 1.3.0; the bump was never installed (a clean install may reject it).",
    );
  });

  it("is partial when tests fail or other dependencies change", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^1.3.0", "^3.1.0"),
      "package-lock.json": lock("1.3.0", "3.1.0"),
      "test/ok.test.mjs": failingTest,
      ...installed("1.3.0"),
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

  it("ignores package-lock.json when npm-shrinkwrap.json exists", async () => {
    const started = await startTask(
      task,
      { ...base, "npm-shrinkwrap.json": lock("1.1.0") },
      params,
    );
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^1.3.0"),
      "package-lock.json": lock("1.3.0"),
      ...installed("1.3.0"),
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons).toContain("No lockfile change mentions left-pad.");
  });

  it("does not count a changed package-lock.json when npm-shrinkwrap.json exists", async () => {
    const started = await startTask(
      task,
      { ...base, "npm-shrinkwrap.json": lock("1.1.0") },
      params,
    );
    const result = await verifyTask(task, started, params, {
      "package-lock.json": lock("1.3.0"),
    });
    expect(result.outcome).toBe("fail");
    expect(result.reasons).toContain("No lockfile change mentions left-pad.");
  });

  it("does not count a build failure that was already present at baseline", async () => {
    const initial: Files = {
      ...base,
      "build.mjs":
        "console.error('BASELINE BUILD FAILURE TAIL'); process.exit(1);\n",
    };
    const started = await startTask(task, initial, params);
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^1.3.0"),
      "package-lock.json": lock("1.3.0"),
      ...installed("1.3.0"),
    });
    expect(result.outcome).toBe("pass");
    expect(result.reasons.join("\n")).toContain("failed at baseline too");
    expect(result.reasons.join("\n")).toContain("BASELINE BUILD FAILURE TAIL");
  });

  it("counts a build failure after a passing baseline and includes its output tail", async () => {
    const started = await startTask(task, base, params);
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^1.3.0"),
      "package-lock.json": lock("1.3.0"),
      ...installed("1.3.0"),
      "build.mjs":
        "console.error('VERIFY BUILD FAILURE TAIL'); process.exit(1);\n",
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons.join("\n")).toContain("build script failed");
    expect(result.reasons.join("\n")).toContain("VERIFY BUILD FAILURE TAIL");
  });

  it("counts build failures when baseline scripts were skipped", async () => {
    const started = await startTask(task, base, params, {
      skipBaselineScripts: true,
    });
    const result = await verifyTask(task, started, params, {
      "package.json": pkg("^1.3.0"),
      "package-lock.json": lock("1.3.0"),
      ...installed("1.3.0"),
      "build.mjs":
        "console.error('UNKNOWN BASELINE BUILD TAIL'); process.exit(1);\n",
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons.join("\n")).toContain(
      "Baseline health is unknown (baseline scripts were not recorded).",
    );
    expect(result.reasons.join("\n")).toContain("UNKNOWN BASELINE BUILD TAIL");
  });

  it("does not resolve packages above the repository root", async () => {
    // zod is installed in packages/benchmarks/node_modules, above the fixture
    // root; finding it would mean the walk escaped the repository.
    const zodLock = (version: string): string =>
      `${JSON.stringify({
        name: "fixture",
        lockfileVersion: 3,
        packages: {
          "": { dependencies: { zod: `^${version}` } },
          "node_modules/zod": { version },
        },
      })}\n`;
    const zodBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(scripts, {
        dependencies: { zod: "^4.6.5" },
      }),
      "package-lock.json": zodLock("4.6.5"),
      "build.mjs": "console.log('built');\n",
      "test/ok.test.mjs": passingTest,
    };
    const zodParams = { package: "zod" };
    const started = await startTask(task, zodBase, zodParams);
    const result = await verifyTask(task, started, zodParams, {
      "package.json": npmPackage(scripts, {
        dependencies: { zod: "^4.6.7" },
      }),
      "package-lock.json": zodLock("4.6.7"),
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "zod is not installed in node_modules (resolved from the repo root); the bump was never installed (a clean install may reject it).",
    );
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

describe("dep-patch-bump workspaces", () => {
  const workspacePkg = (leftPad: string): string =>
    `${JSON.stringify({
      name: "a",
      version: "1.0.0",
      private: true,
      dependencies: { "left-pad": leftPad },
    })}\n`;
  const workspaceLock = (leftPad: string): string =>
    `${JSON.stringify({
      name: "fixture",
      lockfileVersion: 3,
      packages: {
        "packages/a": { dependencies: { "left-pad": `^${leftPad}` } },
        "node_modules/left-pad": { version: leftPad },
      },
    })}\n`;
  const workspaceBase: Files = {
    ".gitignore": "node_modules/\n",
    "package.json": npmPackage(scripts, { workspaces: ["packages/*"] }),
    "packages/a/package.json": workspacePkg("^1.1.0"),
    "package-lock.json": workspaceLock("1.1.0"),
    "build.mjs": "console.log('built');\n",
    "test/ok.test.mjs": passingTest,
  };

  it("matches a hoisted install from a workspace manifest", async () => {
    const started = await startTask(task, workspaceBase, params);
    const result = await verifyTask(task, started, params, {
      "packages/a/package.json": workspacePkg("^1.3.0"),
      "package-lock.json": workspaceLock("1.3.0"),
      ...installed("1.3.0"),
    });
    expect(result.outcome).toBe("pass");
    expect(result.reasons).toContain(
      "Installed left-pad 1.3.0 matches the lockfile.",
    );
  });

  it("prefers the nearest node_modules over the hoisted one", async () => {
    const started = await startTask(task, workspaceBase, params);
    const result = await verifyTask(task, started, params, {
      "packages/a/package.json": workspacePkg("^1.3.0"),
      "package-lock.json": workspaceLock("1.3.0"),
      ...installed("1.3.0"),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.1.0" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "node_modules has left-pad 1.1.0 but the lockfile says 1.3.0; the bump was never installed (a clean install may reject it).",
    );
  });
});

describe("dep-patch-bump per-workspace lockfiles", () => {
  const dep = (leftPad: string): string =>
    `${JSON.stringify({
      name: "ws",
      version: "1.0.0",
      private: true,
      dependencies: { "left-pad": leftPad },
    })}\n`;
  const localLock = (version: string): string =>
    `${JSON.stringify({
      name: "ws",
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { "left-pad": `^${version}` } },
        "node_modules/left-pad": { version },
      },
    })}\n`;
  const independentBase: Files = {
    ".gitignore": "node_modules/\n",
    "package.json": npmPackage({}),
    "a/package.json": dep("^1.1.0"),
    "a/package-lock.json": localLock("1.1.0"),
    "a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.1.0" })}\n`,
    "b/package.json": dep("^1.1.0"),
    "b/package-lock.json": localLock("1.1.0"),
    "b/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.1.0" })}\n`,
  };
  const independentBump = (leftPad: string): Files => ({
    "a/package.json": dep(leftPad),
    "a/package-lock.json": localLock("1.3.0"),
    "a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.3.0" })}\n`,
  });

  it("is partial when a sibling project's lockfile was not updated", async () => {
    const started = await startTask(task, independentBase, params);
    const result = await verifyTask(task, started, params, {
      ...independentBump("^1.3.0"),
      "b/package.json": dep("^1.3.0"),
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "b/package.json bumps left-pad but its lockfile b/package-lock.json was not updated; the bump was never installed (a clean install may reject it).",
    );
  });

  it("ignores sibling projects whose spec did not change", async () => {
    const started = await startTask(task, independentBase, params);
    const result = await verifyTask(
      task,
      started,
      params,
      independentBump("^1.3.0"),
    );
    expect(result.outcome).toBe("pass");
    expect(result.reasons.join("\n")).not.toContain("b/package-lock.json");
  });

  it("keeps untouched pnpm workspaces on their own locked version", async () => {
    const pnpmWorkspaces: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(
        {},
        { packageManager: "pnpm@9.15.0", workspaces: ["packages/*"] },
      ),
      "pnpm-lock.yaml": pnpmImporters(
        { "packages/a": "^1.0.0", "packages/b": "^0.9.0" },
        { "packages/a": "1.0.0", "packages/b": "0.9.0" },
        ["1.0.0", "0.9.0"],
      ),
      "packages/a/package.json": dep("^1.0.0"),
      "packages/b/package.json": dep("^0.9.0"),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
      "packages/b/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "0.9.0" })}\n`,
    };
    const started = await startTask(task, pnpmWorkspaces, params);
    const result = await verifyTask(task, started, params, {
      "packages/a/package.json": dep("^1.0.1"),
      "pnpm-lock.yaml": pnpmImporters(
        { "packages/a": "^1.0.1", "packages/b": "^0.9.0" },
        { "packages/a": "1.0.1", "packages/b": "0.9.0" },
        ["1.0.1", "0.9.0"],
      ),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.1" })}\n`,
    });
    expect(result.outcome).toBe("pass");
    expect(result.reasons).toContain(
      "Installed left-pad 1.0.1 matches the lockfile.",
    );
  });

  it("uses the pnpm importer's resolved version, not the whole lockfile", async () => {
    const pnpmWorkspaces: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(
        {},
        { packageManager: "pnpm@9.15.0", workspaces: ["packages/*"] },
      ),
      "pnpm-lock.yaml": pnpmImporters(
        { "packages/a": "^1.0.0", "packages/b": "^1.0.0" },
        { "packages/a": "1.0.0", "packages/b": "1.0.0" },
        ["1.0.0"],
      ),
      "packages/a/package.json": dep("^1.0.0"),
      "packages/b/package.json": dep("^1.0.0"),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
      "packages/b/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
    };
    const started = await startTask(task, pnpmWorkspaces, params);
    const result = await verifyTask(task, started, params, {
      "packages/a/package.json": dep("^1.0.1"),
      // Both importers resolve 1.0.1, but a transitive dependent pins 1.0.0.
      "pnpm-lock.yaml": pnpmImporters(
        { "packages/a": "^1.0.1", "packages/b": "^1.0.0" },
        { "packages/a": "1.0.1", "packages/b": "1.0.1" },
        ["1.0.0", "1.0.1"],
      ),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.1" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "node_modules has left-pad 1.0.0 but the lockfile says 1.0.1; the bump was never installed (a clean install may reject it).",
    );
  });

  it("reports an unchanged pnpm workspace with no importer entry", async () => {
    const pnpmWorkspaceLock = (
      aSpecifier: string,
      aVersion: string,
      bHasEntry: boolean,
    ): string => {
      const b = bHasEntry
        ? `  packages/b:
    dependencies:
      left-pad:
        specifier: ^1.0.0
        version: 1.0.0
`
        : "  packages/b: {}\n";
      return `lockfileVersion: '9.0'

importers:

  packages/a:
    dependencies:
      left-pad:
        specifier: ${aSpecifier}
        version: ${aVersion}

${b}
packages:
  left-pad@${aVersion}:
    resolution: {}
`;
    };
    const pnpmWorkspaces: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(
        {},
        { packageManager: "pnpm@9.15.0", workspaces: ["packages/*"] },
      ),
      "pnpm-lock.yaml": pnpmWorkspaceLock("^1.0.0", "1.0.0", true),
      "packages/a/package.json": dep("^1.0.0"),
      "packages/b/package.json": dep("^1.0.0"),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
      "packages/b/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
      "build.mjs": "console.log('built');\n",
      "test/ok.test.mjs": passingTest,
    };
    const started = await startTask(task, pnpmWorkspaces, params);
    const result = await verifyTask(task, started, params, {
      "packages/a/package.json": dep("^1.0.1"),
      "pnpm-lock.yaml": pnpmWorkspaceLock("^1.0.1", "1.0.1", false),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.1" })}\n`,
      "packages/b/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.1" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "pnpm-lock.yaml has no left-pad entry reachable from packages/b; the bump was never installed (a clean install may reject it).",
    );
  });

  it("does not use a transitive pnpm dependency as the root lock entry", async () => {
    const zodParams = { package: "zod" };
    const pnpmBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(scripts, {
        packageManager: "pnpm@5.18.0",
        dependencies: { zod: "^4.6.5" },
      }),
      "pnpm-lock.yaml": `lockfileVersion: 5.4

specifiers:
  zod: ^4.6.5

dependencies:
  zod: 4.6.5

packages:
  /zod/4.6.5:
    resolution: {integrity: old}
`,
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.5" })}\n`,
      "build.mjs": "console.log('built');\n",
      "test/ok.test.mjs": passingTest,
    };
    const started = await startTask(task, pnpmBase, zodParams);
    const result = await verifyTask(task, started, zodParams, {
      "package.json": npmPackage(scripts, {
        packageManager: "pnpm@5.18.0",
        dependencies: { zod: "^4.6.7" },
      }),
      "pnpm-lock.yaml": `lockfileVersion: 5.4

specifiers:
  zod: ^4.6.7

packages:
  /zod/4.6.7:
    resolution: {integrity: zod}
  /foo/1.0.0:
    resolution: {integrity: foo}
    dependencies:
      zod: 4.6.7
`,
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.7" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "pnpm-lock.yaml has no zod entry reachable from the repo root; the bump was never installed (a clean install may reject it).",
    );
  });

  it("ignores comments when reading a pnpm importer", async () => {
    const zodParams = { package: "zod" };
    const pnpmRootLock = (
      specifier: string,
      version: string,
      withComments = false,
    ): string => `lockfileVersion: '9.0'

importers:
${withComments ? "  # root importer comment\n" : ""}  .:
${withComments ? "      # comment before dependency sections\n" : ""}    dependencies:
      zod:
        specifier: ${specifier}
        version: ${version}

packages:
  zod@${version}:
    resolution: {}
`;
    const pnpmBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(scripts, {
        packageManager: "pnpm@9.15.0",
        dependencies: { zod: "^4.6.5" },
      }),
      "pnpm-lock.yaml": pnpmRootLock("^4.6.5", "4.6.5"),
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.5" })}\n`,
      "build.mjs": "console.log('built');\n",
      "test/ok.test.mjs": passingTest,
    };
    const started = await startTask(task, pnpmBase, zodParams);
    const result = await verifyTask(task, started, zodParams, {
      "package.json": npmPackage(scripts, {
        packageManager: "pnpm@9.15.0",
        dependencies: { zod: "^4.6.7" },
      }),
      "pnpm-lock.yaml": pnpmRootLock("^4.6.7", "4.6.7", true),
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.7" })}\n`,
    });
    expect(result.outcome).toBe("pass");
    expect(result.reasons).toContain(
      "Installed zod 4.6.7 matches the lockfile.",
    );
  });

  it("uses the yarn entry for the declared range, not the whole lockfile", async () => {
    const yarnBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(
        {},
        {
          packageManager: "yarn@1.22.0",
          dependencies: { "left-pad": "^1.0.0" },
        },
      ),
      "yarn.lock": `left-pad@^1.0.0:
  version "1.0.0"
  resolved "x"

left-pad@1.0.0:
  version "1.0.0"
  resolved "y"
`,
      "node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
    };
    const started = await startTask(task, yarnBase, params);
    const result = await verifyTask(task, started, params, {
      "yarn.lock": `left-pad@^1.0.0:
  version "1.0.1"
  resolved "x"

left-pad@1.0.0:
  version "1.0.0"
  resolved "y"
`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "node_modules has left-pad 1.0.0 but the lockfile says 1.0.1; the bump was never installed (a clean install may reject it).",
    );
  });

  it("uses the yarn berry entry when the whole descriptor list is quoted", async () => {
    const berryLock = (version: string): string => `__metadata:
  version: 8

"left-pad@npm:1.0.0, left-pad@npm:^1.0.0":
  version: ${version}
  resolution: "left-pad@npm:${version}"

"left-pad@npm:0.9.0":
  version: 1.0.0
  resolution: "left-pad@npm:1.0.0"
`;
    const berryBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(
        {},
        {
          packageManager: "yarn@4.5.0",
          dependencies: { "left-pad": "^1.0.0" },
        },
      ),
      "yarn.lock": berryLock("1.0.0"),
      "node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
    };
    const started = await startTask(task, berryBase, params);
    const result = await verifyTask(task, started, params, {
      "yarn.lock": berryLock("1.0.1"),
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "node_modules has left-pad 1.0.0 but the lockfile says 1.0.1; the bump was never installed (a clean install may reject it).",
    );
  });

  it("is partial when the npm lockfile installs nothing reachable for a workspace", async () => {
    const sparseLock = (aVersion: string, cSpec: string): string =>
      `${JSON.stringify({
        name: "fixture",
        lockfileVersion: 3,
        packages: {
          "packages/a": { dependencies: { "left-pad": `^${aVersion}` } },
          "packages/c": { dependencies: { "left-pad": cSpec } },
          "node_modules/other": { version: "2.0.0" },
          "packages/a/node_modules/left-pad": { version: aVersion },
        },
      })}\n`;
    const sparseBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(scripts, { workspaces: ["packages/*"] }),
      "packages/a/package.json": dep("^1.0.0"),
      "packages/c/package.json": dep("^1.1.0"),
      "package-lock.json": sparseLock("1.0.0", "^1.1.0"),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
      "packages/c/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.1.0" })}\n`,
      "build.mjs": "console.log('built');\n",
      "test/ok.test.mjs": passingTest,
    };
    const started = await startTask(task, sparseBase, params);
    const result = await verifyTask(task, started, params, {
      "packages/a/package.json": dep("^1.1.0"),
      "packages/c/package.json": dep("^1.2.0"),
      "package-lock.json": sparseLock("1.1.0", "^1.2.0"),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.1.0" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "package-lock.json has no left-pad entry reachable from packages/c; the bump was never installed (a clean install may reject it).",
    );
  });

  const bunLock = (
    specs: Record<string, string>,
    entries: Record<string, string>,
    includeBEntry = true,
  ): string =>
    `{
  "lockfileVersion": 0,
  "workspaces": {
    "": { "name": "fixture" },
    "packages/a": { "name": "a", "dependencies": { "left-pad": "${specs["packages/a"]}" } },
    "packages/b": { "name": "b"${includeBEntry ? `, "dependencies": { "left-pad": "${specs["packages/b"]}" }` : ""} },
  },
  "packages": {
${Object.entries(entries)
  .map(([key, version]) => `    "${key}": ["left-pad@${version}", "", {}],`)
  .join("\n")}
  },
}
`;
  const bunWorkspaces: Files = {
    ".gitignore": "node_modules/\n",
    "package.json": npmPackage(
      {},
      { packageManager: "bun@1.2.0", workspaces: ["packages/*"] },
    ),
    "bun.lock": bunLock(
      { "packages/a": "^1.0.0", "packages/b": "^1.0.0" },
      {
        "left-pad": "1.0.0",
        "other/left-pad": "1.0.0",
      },
    ),
    "packages/a/package.json": dep("^1.0.0"),
    "packages/b/package.json": dep("^1.0.0"),
    "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
    "packages/b/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
  };

  it("uses the bun package entry for the workspace, not the whole lockfile", async () => {
    const started = await startTask(task, bunWorkspaces, params);
    const result = await verifyTask(task, started, params, {
      "packages/a/package.json": dep("^1.0.1"),
      // a now resolves 1.0.1; another workspace still pins 1.0.0.
      "bun.lock": bunLock(
        { "packages/a": "^1.0.1", "packages/b": "^1.0.0" },
        {
          "left-pad": "1.0.1",
          "other/left-pad": "1.0.0",
        },
      ),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.1" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "node_modules has left-pad 1.0.0 but the lockfile says 1.0.1; the bump was never installed (a clean install may reject it).",
    );
  });

  it("keeps a nested bun entry on its own version", async () => {
    const started = await startTask(
      task,
      {
        ...bunWorkspaces,
        "bun.lock": bunLock(
          { "packages/a": "^1.0.0", "packages/b": "^0.9.0" },
          {
            "left-pad": "1.0.0",
            "b/left-pad": "0.9.0",
            "other/left-pad": "1.0.0",
          },
        ),
        "packages/b/package.json": dep("^0.9.0"),
        "packages/b/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "0.9.0" })}\n`,
      },
      params,
    );
    const result = await verifyTask(task, started, params, {
      "packages/a/package.json": dep("^1.0.1"),
      "bun.lock": bunLock(
        { "packages/a": "^1.0.1", "packages/b": "^0.9.0" },
        {
          "left-pad": "1.0.1",
          "b/left-pad": "0.9.0",
          "other/left-pad": "1.0.0",
        },
      ),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.1" })}\n`,
    });
    expect(result.outcome).toBe("pass");
    expect(result.reasons).toContain(
      "Installed left-pad 0.9.0 matches the lockfile.",
    );
  });

  it("does not let an extraneous install match another workspace's lock entry", async () => {
    const wsLock = (hoisted: string): string =>
      `${JSON.stringify({
        name: "fixture",
        lockfileVersion: 3,
        packages: {
          "packages/a": { dependencies: { "left-pad": "^1.0.0" } },
          "packages/b": { dependencies: { "left-pad": `^${hoisted}` } },
          "node_modules/left-pad": { version: hoisted },
          "packages/a/node_modules/left-pad": { version: "1.0.0" },
        },
      })}\n`;
    const extraneousBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(scripts, { workspaces: ["packages/*"] }),
      "packages/a/package.json": dep("^1.0.0"),
      "packages/b/package.json": dep("^1.1.0"),
      "package-lock.json": wsLock("1.1.0"),
      "node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.1.0" })}\n`,
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
      "packages/b/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.1.0" })}\n`,
      "build.mjs": "console.log('built');\n",
      "test/ok.test.mjs": passingTest,
    };
    const started = await startTask(task, extraneousBase, params);
    const result = await verifyTask(task, started, params, {
      "packages/b/package.json": dep("^1.3.0"),
      "package-lock.json": wsLock("1.3.0"),
      "node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.3.0" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "node_modules has left-pad 1.1.0 but the lockfile says 1.3.0; the bump was never installed (a clean install may reject it).",
    );
  });

  it("reports an unchanged bun workspace with no lockfile entry", async () => {
    const started = await startTask(task, bunWorkspaces, params);
    const result = await verifyTask(task, started, params, {
      "packages/a/package.json": dep("^1.0.1"),
      "bun.lock": bunLock(
        { "packages/a": "^1.0.1", "packages/b": "^1.0.0" },
        { "left-pad": "1.0.1" },
        false,
      ),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.1" })}\n`,
      "packages/b/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.1" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "bun.lock has no left-pad entry reachable from packages/b; the bump was never installed (a clean install may reject it).",
    );
  });

  it("is partial when bun.lock records the old range for a bumped workspace", async () => {
    const started = await startTask(task, bunWorkspaces, params);
    const result = await verifyTask(task, started, params, {
      "packages/a/package.json": dep("^1.0.1"),
      "packages/b/package.json": dep("^1.0.1"),
      // a bumps fully; b's recorded range and resolution stay at the old one.
      "bun.lock": bunLock(
        { "packages/a": "^1.0.1", "packages/b": "^1.0.0" },
        {
          "left-pad": "1.0.1",
          "b/left-pad": "1.0.0",
          "other/left-pad": "1.0.0",
        },
      ),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.1" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "packages/b/package.json declares left-pad ^1.0.1 but bun.lock still records ^1.0.0 for it; the bump was never installed (a clean install may reject it).",
    );
  });

  it("is partial when pnpm-lock.yaml records the old specifier for a bumped workspace", async () => {
    const pnpmWorkspaces: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(
        {},
        { packageManager: "pnpm@9.15.0", workspaces: ["packages/*"] },
      ),
      "pnpm-lock.yaml": pnpmImporters(
        { "packages/a": "^1.0.0", "packages/b": "^1.0.0" },
        { "packages/a": "1.0.0", "packages/b": "1.0.0" },
        ["1.0.0"],
      ),
      "packages/a/package.json": dep("^1.0.0"),
      "packages/b/package.json": dep("^1.0.0"),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
      "packages/b/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
    };
    const started = await startTask(task, pnpmWorkspaces, params);
    const result = await verifyTask(task, started, params, {
      "packages/a/package.json": dep("^1.0.1"),
      "packages/b/package.json": dep("^1.0.1"),
      // a bumps fully; b's importer keeps the old specifier and resolution.
      "pnpm-lock.yaml": pnpmImporters(
        { "packages/a": "^1.0.1", "packages/b": "^1.0.0" },
        { "packages/a": "1.0.1", "packages/b": "1.0.0" },
        ["1.0.0", "1.0.1"],
      ),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.1" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "packages/b/package.json declares left-pad ^1.0.1 but pnpm-lock.yaml still records ^1.0.0 for it; the bump was never installed (a clean install may reject it).",
    );
  });

  it("reads legacy pnpm specifiers and accepts a matching updated range", async () => {
    const zodParams = { package: "zod" };
    const legacyLock = (specifier: string, version: string): string =>
      `lockfileVersion: 5.4

specifiers:
  zod: ${specifier}

dependencies:
  zod: ${version}

packages:
  /zod/${version}:
    resolution: {integrity: sha512-fixture}
`;
    const legacyBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(scripts, {
        packageManager: "pnpm@7.0.0",
        dependencies: { zod: "^4.6.5" },
      }),
      "pnpm-lock.yaml": legacyLock("^4.6.5", "4.6.5"),
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.5" })}\n`,
      "build.mjs": "console.log('built');\n",
      "test/ok.test.mjs": passingTest,
    };
    const staleStarted = await startTask(task, legacyBase, zodParams);
    const stale = await verifyTask(task, staleStarted, zodParams, {
      "package.json": npmPackage(scripts, {
        packageManager: "pnpm@7.0.0",
        dependencies: { zod: "^4.6.7" },
      }),
      "pnpm-lock.yaml": legacyLock("^4.6.5", "4.6.7"),
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.7" })}\n`,
    });
    expect(stale.outcome).toBe("partial");
    expect(stale.reasons).toContain(
      "package.json declares zod ^4.6.7 but pnpm-lock.yaml still records ^4.6.5 for it; the bump was never installed (a clean install may reject it).",
    );

    const updatedStarted = await startTask(task, legacyBase, zodParams);
    const updated = await verifyTask(task, updatedStarted, zodParams, {
      "package.json": npmPackage(scripts, {
        packageManager: "pnpm@7.0.0",
        dependencies: { zod: "^4.6.7" },
      }),
      "pnpm-lock.yaml": legacyLock("^4.6.7", "4.6.7"),
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.7" })}\n`,
    });
    expect(updated.outcome).toBe("pass");
    expect(updated.reasons).toContain(
      "Installed zod 4.6.7 matches the lockfile.",
    );
  });

  it("is partial when package-lock.json records the old range for a bumped workspace", async () => {
    const recordedLock = (bSpec: string, aVersion: string): string =>
      `${JSON.stringify({
        name: "fixture",
        lockfileVersion: 3,
        packages: {
          "packages/a": { dependencies: { "left-pad": `^${aVersion}` } },
          "packages/b": { dependencies: { "left-pad": bSpec } },
          "packages/a/node_modules/left-pad": { version: aVersion },
        },
      })}\n`;
    const recordedBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(scripts, { workspaces: ["packages/*"] }),
      "packages/a/package.json": dep("^1.0.0"),
      "packages/b/package.json": dep("^1.1.0"),
      "package-lock.json": recordedLock("^1.1.0", "1.0.0"),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
      "packages/b/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.1.0" })}\n`,
      "build.mjs": "console.log('built');\n",
      "test/ok.test.mjs": passingTest,
    };
    const started = await startTask(task, recordedBase, params);
    const result = await verifyTask(task, started, params, {
      "packages/a/package.json": dep("^1.1.0"),
      "packages/b/package.json": dep("^1.2.0"),
      // a bumps fully; b's recorded range stays at the old one.
      "package-lock.json": recordedLock("^1.1.0", "1.1.0"),
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.1.0" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "packages/b/package.json declares left-pad ^1.2.0 but package-lock.json still records ^1.1.0 for it; the bump was never installed (a clean install may reject it).",
    );
  });

  it("is partial when yarn.lock has no entry for a bumped range", async () => {
    const yarnBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(
        {},
        { packageManager: "yarn@1.22.0", workspaces: ["packages/*"] },
      ),
      "packages/a/package.json": dep("^1.0.0"),
      "packages/b/package.json": dep("^1.0.0"),
      "yarn.lock": 'left-pad@^1.0.0:\n  version "1.0.0"\n  resolved "x"\n',
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
      "packages/b/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.0" })}\n`,
    };
    const started = await startTask(task, yarnBase, params);
    const result = await verifyTask(task, started, params, {
      "packages/b/package.json": dep("^1.0.1"),
      // a's entry resolved to 1.0.1, but no entry covers b's new range.
      "yarn.lock": 'left-pad@^1.0.0:\n  version "1.0.1"\n  resolved "x"\n',
      "packages/a/node_modules/left-pad/package.json": `${JSON.stringify({ name: "left-pad", version: "1.0.1" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "packages/b/package.json declares left-pad ^1.0.1 but yarn.lock still records no entry for it; the bump was never installed (a clean install may reject it).",
    );
  });

  it("reports a Yarn workspace with a missing unchanged dependency descriptor", async () => {
    const zodParams = { package: "zod" };
    const yarnBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(scripts, {
        packageManager: "yarn@1.22.0",
        workspaces: ["packages/*"],
      }),
      "packages/a/package.json": npmPackage(scripts, {
        dependencies: { zod: "^4.6.5" },
      }),
      "packages/b/package.json": npmPackage(scripts, {
        dependencies: { zod: "^4.6.5" },
      }),
      "yarn.lock": 'zod@^4.6.5:\n  version "4.6.5"\n  resolved "x"\n',
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.5" })}\n`,
      "build.mjs": "console.log('built');\n",
      "test/ok.test.mjs": passingTest,
    };
    const started = await startTask(task, yarnBase, zodParams);
    const result = await verifyTask(task, started, zodParams, {
      "packages/a/package.json": npmPackage(scripts, {
        dependencies: { zod: "^4.6.7" },
      }),
      "yarn.lock": 'zod@^4.6.7:\n  version "4.6.7"\n  resolved "y"\n',
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.7" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "yarn.lock has no zod entry reachable from packages/b; the bump was never installed (a clean install may reject it).",
    );
  });

  it("reports a Yarn descriptor without a resolved version", async () => {
    const zodParams = { package: "zod" };
    const yarnBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(scripts, {
        packageManager: "yarn@1.22.0",
        workspaces: ["packages/*"],
      }),
      "packages/a/package.json": npmPackage(scripts, {
        dependencies: { zod: "^4.6.5" },
      }),
      "packages/b/package.json": npmPackage(scripts, {
        dependencies: { zod: "^4.6.5" },
      }),
      "yarn.lock": 'zod@^4.6.5:\n  version "4.6.5"\n  resolved "x"\n',
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.5" })}\n`,
      "build.mjs": "console.log('built');\n",
      "test/ok.test.mjs": passingTest,
    };
    const started = await startTask(task, yarnBase, zodParams);
    const result = await verifyTask(task, started, zodParams, {
      "packages/a/package.json": npmPackage(scripts, {
        dependencies: { zod: "^4.6.7" },
      }),
      "yarn.lock": `zod@^4.6.7:
  version "4.6.7"
  resolved "y"

zod@^4.6.5:
  resolution: "zod@npm:4.6.7"
  integrity: sha512-example
`,
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.7" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "yarn.lock has no zod entry reachable from packages/b; the bump was never installed (a clean install may reject it).",
    );
  });

  it("reports a Yarn workspace with a non-semver descriptor version", async () => {
    const zodParams = { package: "zod" };
    const yarnBase: Files = {
      ".gitignore": "node_modules/\n",
      "package.json": npmPackage(scripts, {
        packageManager: "yarn@4.5.0",
        workspaces: ["packages/*"],
      }),
      "packages/a/package.json": npmPackage(scripts, {
        dependencies: { zod: "^4.6.5" },
      }),
      "packages/b/package.json": npmPackage(scripts, {
        dependencies: { zod: "^4.6.5" },
      }),
      "yarn.lock": `__metadata:
  version: 8

"zod@^4.6.5":
  version: 4.6.5
  resolution: "zod@npm:4.6.5"
`,
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.5" })}\n`,
      "build.mjs": "console.log('built');\n",
      "test/ok.test.mjs": passingTest,
    };
    const started = await startTask(task, yarnBase, zodParams);
    const result = await verifyTask(task, started, zodParams, {
      "packages/a/package.json": npmPackage(scripts, {
        dependencies: { zod: "^4.6.7" },
      }),
      "yarn.lock": `__metadata:
  version: 8

"zod@^4.6.7":
  version: 4.6.7
  resolution: "zod@npm:4.6.7"

"zod@^4.6.5":
  version: not-a-version
  resolution: "zod@npm:4.6.7"
`,
      "node_modules/zod/package.json": `${JSON.stringify({ name: "zod", version: "4.6.7" })}\n`,
    });
    expect(result.outcome).toBe("partial");
    expect(result.reasons).toContain(
      "yarn.lock has no zod entry reachable from packages/b; the bump was never installed (a clean install may reject it).",
    );
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
