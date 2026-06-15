/**
 * apps/portal/vitest.config.ts — Vitest config for Client Portal unit/component tests
 *
 * Tier 2/5: Component/unit tests — no DB, no Next.js server, no e2e.
 * The full e2e binding is TASK-005.
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
