/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@soroban-merkle-airdrop/sdk"],
  env: {
    NEXT_PUBLIC_AIRDROP_CONTRACT_ID: process.env.AIRDROP_CONTRACT_ID ?? "",
    NEXT_PUBLIC_NETWORK: process.env.NETWORK ?? "testnet",
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' https://soroban-testnet.stellar.org https://mainnet.sorobanrpc.com",
              "img-src 'self' data:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
