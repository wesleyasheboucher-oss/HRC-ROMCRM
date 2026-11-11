import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a production build run beside `next dev` without overwriting its .next folder
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
