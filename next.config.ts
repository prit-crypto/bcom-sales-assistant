import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-side PDF libraries are loaded as plain Node packages instead of being bundled.
  serverExternalPackages: ["@react-pdf/renderer", "unpdf"],
  // The proposal PDF reads the logo from disk.
  outputFileTracingIncludes: { "/api/proposal": ["./public/brand/**/*"] },
};

export default nextConfig;
