import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/918Scanner",
  assetPrefix: "/918Scanner",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
