import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@fertelligence/core"],
  serverExternalPackages: ["pg-boss"],
};

export default nextConfig;
