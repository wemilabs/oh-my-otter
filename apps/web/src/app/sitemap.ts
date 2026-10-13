import type { MetadataRoute } from "next";
import {
  BUILTIN_TASK_MANIFESTS,
  SITE_URL,
} from "@oh-my-otter/benchmarks/report";
import { builtinChecks } from "@oh-my-otter/checks";
import { source } from "@/lib/source";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/results",
    "/tasks",
    "/checks",
    ...builtinChecks.map((check) => `/checks/${check.id}`),
    "/methodology",
    "/contribute",
    "/privacy",
    ...BUILTIN_TASK_MANIFESTS.map((task) => `/tasks/${task.id}`),
    ...source.getPages().map((page) => page.url),
  ].map((route) => ({ url: `${SITE_URL}${route}` }));
}
