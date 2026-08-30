import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge overlaps the bottom-left of the UI while designing.
  devIndicators: false,
  // The same-origin API proxy lives in app/api/deckhand/[...path]/route.ts —
  // a route handler, not a rewrite, so its target is read per request instead
  // of being baked into the build.
};

export default nextConfig;
