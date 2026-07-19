import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep firebase-admin outside the Turbopack/webpack server bundle. Bundling
  // it pulls jwks-rsa → jose and can crash on Vercel with ERR_REQUIRE_ESM.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
