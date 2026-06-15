/**
 * apps/admin/vitest.config.ts — Vitest config for Tax Portal unit/component tests
 *
 * Mirrors apps/portal/vitest.config.ts (ADR-006 / CLAUDE.md § Platform-frontend scope).
 * Tier 2/5: Component/unit tests — no DB, no Next.js server, no e2e.
 *
 * Uses jsdom environment to simulate browser DOM for React component tests.
 * @testing-library/react + @testing-library/jest-dom for component assertions.
 */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "e2e/**"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    alias: {
      // Resolve @/* paths (matches tsconfig paths)
      "@": path.resolve(__dirname, "./src"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
