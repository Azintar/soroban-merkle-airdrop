import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    alias: {
      // Resolve the workspace SDK to its source so `cd web && pnpm test`
      // works without a prior `pnpm build` of the SDK package.
      "@soroban-merkle-airdrop/sdk": path.resolve(
        __dirname,
        "../sdk/src/index.ts"
      ),
    },
  },
  // Match Next.js' automatic JSX runtime so components render without an
  // explicit `import React` (jsdom does not support raw JSX).
  esbuild: {
    jsx: "automatic",
  },
});
