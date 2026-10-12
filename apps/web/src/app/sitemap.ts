import type { MetadataRoute } from "next";
import { BUILTIN_TASK_MANIFESTS } from "@oh-my-otter/benchmarks/report";

export const dynamic = "force-static";

function baseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://oh-my-otter.vercel.app");
  return url.replace(/\/$/, "");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = baseUrl();
  return [
    "",
    "/results",
    "/tasks",
    "/privacy",
    ...BUILTIN_TASK_MANIFESTS.map((task) => `/tasks/${task.id}`),
  ].map((route) => ({ url: `${base}${route}` }));
}
