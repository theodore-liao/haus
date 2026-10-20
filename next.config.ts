import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The test-household server builds into its own folder so it can run beside the real one.
  distDir: process.env.HAUS_DIST_DIR || ".next",
  devIndicators: false,
  // The sign-in proxy keeps only the first 10 MB of a request by default, which cut large card photos and PDFs short.
  // Matches CARD_UPLOAD_MAX_MB in src/lib/insurance.ts.
  experimental: {
    proxyClientMaxBodySize: "26mb",
  },
  // Allow phones on the home network to load dev-server assets (JS/hydration)
  // when browsing via the machine's LAN IP instead of localhost.
  allowedDevOrigins: ["10.0.0.172", "127.0.0.1"],
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    "tesseract.js",
    "pdf-parse",
    "pdfjs-dist",
  ],
};

export default nextConfig;
