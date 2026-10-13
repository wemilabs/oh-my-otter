import "server-only";
import { cacheLife, cacheTag } from "next/cache";

export const DEFAULT_REPO_API_URL =
  "https://api.github.com/repos/wemilabs/oh-my-otter";
const GITHUB_API_ORIGIN = "https://api.github.com";

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
  const hasAuthorization = Boolean(token && apiOrigin === GITHUB_API_ORIGIN);
  if (hasAuthorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  let signal: AbortSignal;
  try {
    signal = AbortSignal.timeout(opts?.timeoutMs ?? 5000);
  } catch (error) {
    report(
      `could not create request timeout: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }

  const requestInit: RequestInit = { headers, signal };
  if (hasAuthorization) {
    requestInit.redirect = "manual";
  }

  const fetchImpl = opts?.fetchImpl ?? fetch;
  let currentUrl = url;
  let redirects = 0;
  let response: Response;
  while (true) {
    try {
      response = await fetchImpl(currentUrl, requestInit);
    } catch (error) {
      report(
        `could not fetch ${currentUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }

    if (!hasAuthorization || response.status < 300 || response.status > 399) {
      break;
    }

    const location = response.headers.get("Location");
    if (!location) {
      report(`redirect from ${currentUrl} had no Location`);
      return null;
    }
    if (redirects >= 3) {
      report(`too many redirects from ${url}`);
      return null;
    }

    let redirectedUrl: URL;
    try {
      redirectedUrl = new URL(location, currentUrl);
    } catch (error) {
      report(
        `invalid redirect from ${currentUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }

    if (redirectedUrl.origin !== GITHUB_API_ORIGIN) {
      report(
        `refusing cross-origin redirect from ${currentUrl} to ${redirectedUrl.origin}`,
      );
      return null;
    }

    currentUrl = redirectedUrl.href;
    redirects += 1;
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
