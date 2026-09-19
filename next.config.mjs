/** @type {import('next').NextConfig} */
// PWA webpack plugin (@ducanh2912/next-pwa) hangs on load in this environment.
// Installability kept via public/manifest.webmanifest + layout metadata/icons.
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
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
