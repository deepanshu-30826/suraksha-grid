/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // MapLibre GL JS ships a browser CSS file that Next.js must allow
  // through without treating it as an unknown module.
  transpilePackages: ["maplibre-gl"],
};
export default nextConfig;
