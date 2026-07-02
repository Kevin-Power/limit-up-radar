/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["*"],
  outputFileTracingIncludes: {
    "/api/daily/*": ["./data/daily/**/*.json"],
    "/api/revenue/*": ["./data/revenue/**/*.json"],
    "/api/supply-chain/**": ["./data/supply-chain/**/*.json"],
    "/api/focus": ["./data/backtest.json"],
    "/api/stats": ["./data/daily/**/*.json", "./data/analysis/**/*.json"],
    "/api/stock/[code]/intraday": ["./data/intraday_cache/**/*.json"],
    "/api/daytrade": ["./data/intraday_cache/**/*.json", "./data/daily/**/*.json"],
    "/api/daytrade-watch": ["./data/daily/**/*.json", "./data/intraday_cache/**/*.json", "./data/categories.json"],
    "/api/daytrade-track": ["./data/daily/**/*.json", "./data/intraday_cache/**/*.json", "./data/categories.json"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
