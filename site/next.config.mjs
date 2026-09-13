/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static: every page is rendered at build time from the Phase 1d API and served as
  // files. No runtime server, no client-side data fetching.
  output: 'export',
  trailingSlash: false,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
