import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
    globals: false,
    testTimeout: 30000, // tier-3 integration test needs more time for Azurite round-trips
  },
});
