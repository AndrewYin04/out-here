import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Verification builds must not overwrite the live development preview.
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  // The dev-only "N" badge sits on the Out Here map's bottom-left Map / 3D button.
  devIndicators: false,
};

export default nextConfig;
