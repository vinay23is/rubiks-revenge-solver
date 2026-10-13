import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repository may live inside another folder with its own lockfile.
  outputFileTracingRoot: import.meta.dirname,
  poweredByHeader: false,
};

export default nextConfig;
