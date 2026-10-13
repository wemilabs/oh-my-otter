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
  return `lockfileVersion: '9.0'\n\npackages:\n  left-pad@${leftPad}:\n    resolution: {}\n`;
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
        packages: { "node_modules/zod": { version } },
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
        "packages/a": {},
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
