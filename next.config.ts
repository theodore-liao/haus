import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    "tesseract.js",
    "pdf-parse",
    "pdfjs-dist",
  ],
};

export default nextConfig;
