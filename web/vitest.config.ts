import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    alias: {
      "@soroban-merkle-airdrop/sdk": path.resolve(
        __dirname,
        "../sdk/src/index.ts"
      ),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
});