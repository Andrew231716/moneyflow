/** @type {import('next').NextConfig} */
// PWA webpack plugin (@ducanh2912/next-pwa) hangs on load in this environment.
// Installability kept via public/manifest.webmanifest + layout metadata/icons.
// Keep the SW plugin off until Next 15 stability is proven in production.
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
