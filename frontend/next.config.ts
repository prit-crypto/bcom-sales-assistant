import type { NextConfig } from "next";

// The frontend has no server code: all reading, pricing, PDF and message work happens in the backend.
const nextConfig: NextConfig = {
  // The browser tests run their own dev server next to yours; a separate build folder keeps them apart.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
