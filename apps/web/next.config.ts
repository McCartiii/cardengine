import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cards.scryfall.io",
      },
      {
        protocol: "https",
        hostname: "c1.scryfall.com",
      },
    ],
  },
  transpilePackages: ["@cardengine/engine", "@cardengine/mtg-adapter"],
  serverExternalPackages: [
    "@supabase/supabase-js",
    "@supabase/ssr",
    "@supabase/realtime-js"
  ],
  turbopack: {
    resolveAlias: {
      "@supabase/realtime-js": "@supabase/realtime-js/dist/main/index.js",
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@supabase/realtime-js": path.resolve(
        process.cwd(),
        "../../node_modules/@supabase/realtime-js/dist/main/index.js"
      ),
    };
    return config;
  },
};

export default nextConfig;
