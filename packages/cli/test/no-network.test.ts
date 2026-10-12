import { syncBuiltinESMExports } from "node:module";
import * as http from "node:http";
import * as https from "node:https";
import * as compatHttp from "http";
import * as compatHttps from "https";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
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

  it("blocks and records a control fetch request", async () => {
    await expect(fetch("https://example.com")).rejects.toThrow(
      "Network request blocked",
    );
    expect(recorded).toContain("fetch");
  });
});
