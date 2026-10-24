import type { NextConfig } from "next";

// cacheComponents is off on purpose: every page shows per-user data read at request time.
// Security headers follow the pre-release audit. A strict script-src needs per-request nonces (proxy.ts) and is a possible
// next step; the directives below already block framing, plugin content, and form/base hijacking.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The JSON restore uploads a whole backup through a Server Action (default cap is 1 MB).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
