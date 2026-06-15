import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Root-level Vitest config for scripts/ tests
    // Per-package tests use their own vitest configs.
    include: ["scripts/**/*.test.ts"],
    exclude: ["scripts/__test_fixtures__/**", "**/node_modules/**"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      include: ["scripts/**/*.ts"],
      exclude: ["scripts/**/*.test.ts", "scripts/__test_fixtures__/**"],
    },
  },
});
