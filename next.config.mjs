/** @type {import('next').NextConfig} */
// Prefer the free static SW in public/moneyflow-sw.js (registered client-side).
// The @ducanh2912/next-pwa webpack plugin hangs in some build environments.
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn-logos.gocardless.com",
      },
    ],
  },
};

export default nextConfig;
