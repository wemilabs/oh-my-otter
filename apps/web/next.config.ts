import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  typedRoutes: true,
  experimental: {
    exposeTestingApiInProductionBuild: process.env.EXPOSE_TESTING_API === "1",
  },
  turbopack: {
    root: path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../.."),
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
