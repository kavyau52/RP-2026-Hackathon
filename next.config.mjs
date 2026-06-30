/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
    middlewareClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
