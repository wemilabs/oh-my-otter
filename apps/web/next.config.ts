import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../.."),
  },
};

export default nextConfig;
