/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["*"],
  outputFileTracingIncludes: {
    "/api/daily/*": ["./data/daily/**/*.json"],
  },
};

export default nextConfig;
