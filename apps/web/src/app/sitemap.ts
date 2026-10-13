import type { MetadataRoute } from "next";
import {
  BUILTIN_TASK_MANIFESTS,
  SITE_URL,
} from "@oh-my-otter/benchmarks/report";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/results",
    "/tasks",
    "/privacy",
    ...BUILTIN_TASK_MANIFESTS.map((task) => `/tasks/${task.id}`),
  ].map((route) => ({ url: `${SITE_URL}${route}` }));
}
