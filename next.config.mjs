// Only the media bucket may be proxied by /_next/image; a wildcard host would make it an open image proxy.
const r2Host = (() => {
  try { return process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).hostname : null; }
  catch { return null; }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: r2Host ? [{ protocol: "https", hostname: r2Host }] : [],
  },
};

export default nextConfig;
