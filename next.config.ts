import type { NextConfig } from "next";

// Fully client-side app (data lives in IndexedDB on the device), so it ships as
// a static export that any static host can serve. trailingSlash makes every
// route an index.html, which keeps the service worker's offline cache simple.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
