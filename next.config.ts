import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  async headers() {
    return [
      // Long-lived immutable cache for versioned raster icons.
      // (Next.js already sets its own cache policy for /_next/static
      // hashed assets — do not override it.)
      {
        source: "/:icon(icon-192.png|icon-512.png|apple-touch-icon.png)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Never cache HTML, SW, or manifest — updates must reach users instantly.
      {
        source: "/:page(sw.js|manifest.json)",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
