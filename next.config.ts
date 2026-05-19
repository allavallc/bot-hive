import type { NextConfig } from "next";

const distDir = process.platform === "win32" ? ".next-win32" : ".next-linux";

const config: NextConfig = {
  devIndicators: false,
  // Keep Windows and WSL/Linux builds isolated. Running Next from both
  // environments against the same repo can leave a partially-written shared
  // .next tree with missing vendor chunks.
  distDir,
};

export default config;
