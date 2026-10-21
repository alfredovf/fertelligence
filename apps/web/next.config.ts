import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@fertelligence/core"],
  serverExternalPackages: ["pg-boss", "@node-rs/argon2"],
  // Fotos y PDF de hasta 15 MB (formularios firmados, ejercicios)
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
};

export default nextConfig;
