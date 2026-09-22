import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
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
