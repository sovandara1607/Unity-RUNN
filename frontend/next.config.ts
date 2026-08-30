import type { NextConfig } from "next";

const apiBaseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    }];
  },
  async rewrites() {
    return [{ source: "/uploads/:path*", destination: `${apiBaseUrl}/uploads/:path*` }];
  },
};

export default nextConfig;
