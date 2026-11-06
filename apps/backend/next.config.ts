import type { NextConfig } from "next";
const config: NextConfig = {
  // Use the installed TypeScript compiler API for build validation, matching standalone tsc.
  experimental: { useTypeScriptCli: false },
  async rewrites() {
    return [
      { source: "/api/health", destination: "/health" },
      { source: "/api/market", destination: "/films" },
      { source: "/api/publications", destination: "/publications" },
      { source: "/api/film/:chain/:campaign", destination: "/film/:chain/:campaign" },
      { source: "/api/swarm/:reference", destination: "/swarm/:reference" },
    ];
  },
};
export default config;
