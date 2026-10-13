import "server-only";
import { cacheLife, cacheTag } from "next/cache";

export const DEFAULT_REPO_API_URL =
  "https://api.github.com/repos/wemilabs/oh-my-otter";

export async function fetchStarCount(opts?: {
  url?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  warn?: (msg: string) => void;
  timeoutMs?: number;
}): Promise<number | null> {
  const url =
    opts?.url || process.env.OMOT_GITHUB_REPO_API_URL || DEFAULT_REPO_API_URL;
  const token = (opts?.token ?? process.env.GITHUB_TOKEN)?.trim();
  const warn = opts?.warn ?? ((msg: string) => console.warn(`[github] ${msg}`));
  const report = (msg: string) => {
    try {
      warn(msg);
    } catch {
      // Warning callbacks must not make this helper throw.
    }
  };

  let apiOrigin: string;
  try {
    apiOrigin = new URL(url).origin;
  } catch (error) {
    report(
      `invalid repository API URL ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "oh-my-otter-website",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token && apiOrigin === "https://api.github.com") {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    const fetchImpl = opts?.fetchImpl ?? fetch;
    response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 5000),
    });
  } catch (error) {
    report(
      `could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }

  if (!response.ok) {
    report(`fetching ${url} failed with status ${response.status}`);
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    report(
      `could not read ${url} JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !Number.isSafeInteger(
      (body as { stargazers_count?: unknown }).stargazers_count,
    ) ||
    (body as { stargazers_count: number }).stargazers_count < 0
  ) {
    report(`invalid stargazers_count from ${url}`);
    return null;
  }

  return (body as { stargazers_count: number }).stargazers_count;
}

export async function getStarCount(): Promise<number | null> {
  "use cache";
  cacheTag("github-stars");
  const stars = await fetchStarCount();
  if (stars === null) {
    cacheLife("minutes");
  } else {
    cacheLife("hours");
  }
  return stars;
}

const compactNumberFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatStarCount(n: number): string {
  const formatted = compactNumberFormat.format(n);
  const compacted =
    n >= 10_000 && n < 1_000_000
      ? formatted.replace(/\.\d+(?=K$)/, "")
      : formatted;
  return compacted.replace("K", "k");
}

export function starsAccessibleLabel(n: number): string {
  return `Star Oh My Otter on GitHub (${new Intl.NumberFormat("en").format(n)} ${n === 1 ? "star" : "stars"})`;
}
