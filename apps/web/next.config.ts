import type { NextConfig } from "next";

// Keep browser API calls same-origin while running the backend independently.
const config: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.BACKEND_URL ?? "http://localhost:3001"}/api/:path*` }];
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};
export default config;
