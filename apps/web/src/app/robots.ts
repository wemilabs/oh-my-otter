import type { MetadataRoute } from "next";

export const dynamic = "force-static";

function baseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://oh-my-otter.vercel.app");
  return url.replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${baseUrl()}/sitemap.xml`,
  };
}
