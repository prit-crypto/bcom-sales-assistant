import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Where the Next.js server forwards /api/v1/* (the backend's address as seen from this server).
 * Read when the app is built, so the Docker image takes it as a build argument (BACKEND_URL).
 */
const backendUrl = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/+$/, "");

/** An extra origin the browser may call: only when NEXT_PUBLIC_API_URL points straight at a backend. */
function apiOrigin(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return "";
  try {
    return new URL(apiUrl).origin;
  } catch {
    return ""; // a relative URL is this site, already allowed by 'self'
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
  experimental: {
    // Uploads are forwarded to the backend, which enforces its own limit (MAX_UPLOAD_MB, at most 30 MB) with a
    // clear message. Next.js cuts forwarded bodies at 10 MB by default; allow a little more than the backend's
    // maximum so the backend always answers.
    proxyClientMaxBodySize: "32mb",
    // Forwarded requests are cut after 30 s without data by default; an AI read can take longer (the backend
    // gives up by itself after AI_TOTAL_TIMEOUT_SECONDS, 100 s by default).
    proxyTimeout: 120_000,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The browser calls this site; the server passes API requests on to the backend, which stays internal.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${backendUrl}/api/v1/:path*` }];
  },
};

export default nextConfig;
