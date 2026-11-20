import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Where the browser may send requests: this site and the backend API (its origin only). */
function apiOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").origin;
  } catch {
    return "";
  }
}

// No nonces: Next's own inline scripts need 'unsafe-inline' without them, and the page has no
// third-party scripts. In development React also needs 'unsafe-eval', and hot reload uses a websocket.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Previews of the invoice and partner logo are blob: and data: URLs made in the browser.
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin()}${isDev ? " ws: wss:" : ""}`.trim(),
  // The proposal and invoice previews are PDFs shown from blob: URLs.
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

// The frontend has no server code: all reading, pricing, PDF and message work happens in the backend.
const nextConfig: NextConfig = {
  // The browser tests run their own dev server next to yours; a separate build folder keeps them apart.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // A self-contained server for the Docker image (frontend/Dockerfile).
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
