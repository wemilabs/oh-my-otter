import { syncBuiltinESMExports } from "node:module";
import * as http from "node:http";
import * as https from "node:https";
import * as compatHttp from "http";
import * as compatHttps from "https";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import {
  afterEach,
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { main } from "../src/cli";

const recorded: string[] = [];
const require = createRequire(import.meta.url);
const net = require("node:net") as typeof import("node:net");
const tls = require("node:tls") as typeof import("node:tls");
const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../checks/test/fixtures",
);
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function git(cwd: string, args: string[]) {
  return String((await execa("git", args, { cwd })).stdout);
}

function blocked(name: string): never {
  recorded.push(name);
  throw new Error(`Network request blocked: ${name}`);
}

vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    request: vi.fn(() => blocked("node:http.request")),
    get: vi.fn(() => blocked("node:http.get")),
  };
});

vi.mock("node:https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:https")>();
  return {
    ...actual,
    request: vi.fn(() => blocked("node:https.request")),
    get: vi.fn(() => blocked("node:https.get")),
  };
});

vi.mock("http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("http")>();
  return {
    ...actual,
    request: vi.fn(() => blocked("http.request")),
    get: vi.fn(() => blocked("http.get")),
  };
});

vi.mock("https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("https")>();
  return {
    ...actual,
    request: vi.fn(() => blocked("https.request")),
    get: vi.fn(() => blocked("https.get")),
  };
});

const ioFor = (cwd = process.cwd()) => {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      cwd,
      isTTY: false,
      stdout: (text: string) => {
        stdout += text;
      },
      stderr: (text: string) => {
        stderr += text;
      },
    },
    output: () => ({ stdout, stderr }),
  };
};

beforeAll(() => {
  vi.spyOn(http, "request").mockImplementation((() =>
    blocked("node:http.request")) as typeof http.request);
  vi.spyOn(http, "get").mockImplementation((() =>
    blocked("node:http.get")) as typeof http.get);
  vi.spyOn(https, "request").mockImplementation((() =>
    blocked("node:https.request")) as typeof https.request);
  vi.spyOn(https, "get").mockImplementation((() =>
    blocked("node:https.get")) as typeof https.get);
  vi.spyOn(compatHttp, "request").mockImplementation((() =>
    blocked("http.request")) as typeof compatHttp.request);
  vi.spyOn(compatHttp, "get").mockImplementation((() =>
    blocked("http.get")) as typeof compatHttp.get);
  vi.spyOn(compatHttps, "request").mockImplementation((() =>
    blocked("https.request")) as typeof compatHttps.request);
  vi.spyOn(compatHttps, "get").mockImplementation((() =>
    blocked("https.get")) as typeof compatHttps.get);
  vi.spyOn(net, "connect").mockImplementation((() =>
    blocked("net.connect")) as typeof net.connect);
  vi.spyOn(net, "createConnection").mockImplementation((() =>
    blocked("net.createConnection")) as typeof net.createConnection);
  vi.spyOn(tls, "connect").mockImplementation((() =>
    blocked("tls.connect")) as typeof tls.connect);
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    blocked("fetch"),
  );
  syncBuiltinESMExports();
});

beforeEach(() => {
  recorded.length = 0;
});

afterAll(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
});

describe("scanner network guard", () => {
  it.each([
    ["healthy", 100],
    ["bare", 3],
    ["monorepo", 81],
  ] as const)(
    "scans %s fixture without network calls",
    async (fixture, score) => {
      const capture = ioFor();
      const result = await main(
        ["scan", path.join(fixtures, fixture), "--json"],
        capture.io,
      );
      expect(result).toBe(0);
      expect(JSON.parse(capture.output().stdout).score).toBe(score);
      expect(recorded).toEqual([]);
    },
  );

  it("runs checks and badge formatting without network calls", async () => {
    const checks = ioFor();
    expect(
      await main(["checks", path.join(fixtures, "healthy")], checks.io),
    ).toBe(0);
    const badge = ioFor();
    expect(
      await main(["scan", path.join(fixtures, "healthy"), "--badge"], badge.io),
    ).toBe(0);
    expect(badge.output().stdout).toContain("img.shields.io");
    expect(recorded).toEqual([]);
  });

  it("reports without network calls", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "omot-nonet-"));
    tempRoots.push(root);
    await git(root, ["init", "-q", "--initial-branch=main"]);
    await git(root, ["config", "user.name", "Test"]);
    await git(root, ["config", "user.email", "test@example.invalid"]);
    await git(root, ["config", "commit.gpgsign", "false"]);
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "f",
        private: true,
        type: "module",
        scripts: { test: "node --test" },
      }),
    );
    await writeFile(path.join(root, "package-lock.json"), "{}");
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src/math.mjs"),
      "export function add(a, b) { return a + b; }\n",
    );
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-qm", "baseline"]);

    const ioFor2 = () => {
      let stdout = "";
      let stderr = "";
      return {
        io: {
          cwd: root,
          isTTY: true,
          stdout: (text: string) => {
            stdout += text;
          },
          stderr: (text: string) => {
            stderr += text;
          },
          confirm: async () => true,
          ask: async () => "",
          openUrl: async () => {},
          copyToClipboard: async () => {},
        },
        output: () => ({ stdout, stderr }),
      };
    };

    const started = ioFor2();
    expect(
      await main(
        [
          "bench",
          "start",
          "add-unit-test",
          "--param",
          "file=src/math.mjs",
          "--param",
          "function=add",
          "--yes",
        ],
        started.io,
      ),
    ).toBe(0);
    await writeFile(
      path.join(root, "add.test.mjs"),
      'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { add } from "./src/math.mjs";\ntest("add", () => assert.equal(add(1, 2), 3));\n',
    );
    const verified = ioFor2();
    expect(
      await main(
        ["bench", "verify", "--corrections", "0", "--minutes", "1"],
        verified.io,
      ),
    ).toBe(0);

    const dry = ioFor2();
    expect(await main(["report", "--dry-run"], dry.io)).toBe(0);
    const submitted = ioFor2();
    expect(await main(["report"], submitted.io)).toBe(0);
    expect(recorded).toEqual([]);
  });

  it("blocks and records a control fetch request", async () => {
    await expect(fetch("https://example.com")).rejects.toThrow(
      "Network request blocked",
    );
    expect(recorded).toContain("fetch");
  });
});
