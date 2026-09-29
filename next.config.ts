import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow larger uploads (RPG rulebooks can be big).
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // unpdf ships its own pdfjs build; keep it external on the server.
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
