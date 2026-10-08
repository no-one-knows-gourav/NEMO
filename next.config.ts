import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prototype uses live/dynamic API routes (SSE pipeline, RAG Q&A),
  // so we keep the default (uncached) rendering model.
  turbopack: {
    rules: {
      // Tailwind v4 is processed through its Turbopack loader (set up by
      // create-next-app). Without this, `@import "tailwindcss"` is not
      // expanded and no utility classes are generated.
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
