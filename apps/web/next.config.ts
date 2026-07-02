import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Monorepo: the workspace root, not this app dir
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
