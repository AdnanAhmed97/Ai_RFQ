import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vendor documents are read server-side only; keep the AI + document
  // libraries out of any client bundle.
  serverExternalPackages: ["@anthropic-ai/sdk"],
  experimental: {
    // Vendor uploads are large; extraction runs server-side.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
