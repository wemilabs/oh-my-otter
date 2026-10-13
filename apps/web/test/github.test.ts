import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REPO_API_URL,
  fetchStarCount,
  formatStarCount,
  starsAccessibleLabel,
} from "../src/lib/github";

function mockFetch(response: Response) {
  return vi.fn(async (...args: Parameters<typeof fetch>) => {
    void args;
    return response;
  }) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fetchStarCount", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("OMOT_GITHUB_REPO_API_URL", "");
  });

  it("fetches the default GitHub repository endpoint", async () => {
    const fetchImpl = mockFetch(Response.json({ stargazers_count: 128 }));

    await expect(fetchStarCount({ fetchImpl, warn: vi.fn() })).resolves.toBe(
      128,
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(DEFAULT_REPO_API_URL);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Accept")).toBe("application/vnd.github+json");
    expect(headers.get("User-Agent")).toBe("oh-my-otter-website");
    expect(headers.get("X-GitHub-Api-Version")).toBe("2022-11-28");
    expect(headers.has("Authorization")).toBe(false);
  });

  it("sends a trimmed token to the default GitHub endpoint", async () => {
    vi.stubEnv("GITHUB_TOKEN", "  test-token  ");
    const fetchImpl = mockFetch(Response.json({ stargazers_count: 128 }));

    await fetchStarCount({ fetchImpl, warn: vi.fn() });

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer test-token",
    );
  });

  it("does not send a token to an overridden host", async () => {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    const fetchImpl = mockFetch(Response.json({ stargazers_count: 128 }));

    await fetchStarCount({
      url: "https://example.com/repo",
      fetchImpl,
      warn: vi.fn(),
    });

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });

  it("uses the endpoint environment override", async () => {
    vi.stubEnv("OMOT_GITHUB_REPO_API_URL", "https://example.com/override");
    const fetchImpl = mockFetch(Response.json({ stargazers_count: 128 }));

    await fetchStarCount({ fetchImpl, warn: vi.fn() });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://example.com/override");
  });

  it.each([403, 500])(
    "returns null and warns for status %i",
    async (status) => {
      const warn = vi.fn();
      const fetchImpl = mockFetch(new Response("", { status }));

      await expect(fetchStarCount({ fetchImpl, warn })).resolves.toBeNull();
      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0]?.[0])).toContain(String(status));
    },
  );

  it("returns null and warns when fetch rejects", async () => {
    const warn = vi.fn();
    const fetchImpl = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      throw new Error("connection refused");
    }) as unknown as typeof fetch;

    await expect(fetchStarCount({ fetchImpl, warn })).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("returns null and warns when JSON parsing fails", async () => {
    const warn = vi.fn();
    const fetchImpl = mockFetch({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid JSON");
      },
    } as Response);

    await expect(fetchStarCount({ fetchImpl, warn })).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it.each([
    { name: "missing count", body: {} },
    { name: "string count", body: { stargazers_count: "128" } },
    { name: "negative count", body: { stargazers_count: -1 } },
    { name: "fractional count", body: { stargazers_count: 1.5 } },
    { name: "null body", body: null },
    { name: "array body", body: [] },
  ])("returns null and warns for invalid $name", async ({ body }) => {
    const warn = vi.fn();
    const fetchImpl = mockFetch(Response.json(body));

    await expect(fetchStarCount({ fetchImpl, warn })).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("returns null and warns for an invalid URL", async () => {
    const warn = vi.fn();
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    await expect(
      fetchStarCount({ url: "://invalid", fetchImpl, warn }),
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("formatStarCount", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1k"],
    [1234, "1.2k"],
    [12345, "12k"],
    [123456, "123k"],
    [1234567, "1.2M"],
  ])("formats %i as %s", (count, expected) => {
    expect(formatStarCount(count)).toBe(expected);
  });
});

describe("starsAccessibleLabel", () => {
  it("uses singular for one star", () => {
    expect(starsAccessibleLabel(1)).toBe("Star Oh My Otter on GitHub (1 star)");
  });

  it("formats larger counts with grouping and plural", () => {
    expect(starsAccessibleLabel(1234)).toBe(
      "Star Oh My Otter on GitHub (1,234 stars)",
    );
  });
});
