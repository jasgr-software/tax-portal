import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
    globals: false,
    testTimeout: 15000, // Allow up to 15s for integration tests (Mailhog round-trip)
  },
});
