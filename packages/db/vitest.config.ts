import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
    globals: false,
    // DECISION (TASK-006): globalSetup loads .env.local from repo root so tier-3
    // integration tests pick up DATABASE_URL_ADMIN / DATABASE_URL without requiring
    // manual shell export. Runs in the main process before forks are created.
    // See vitest.setup.ts for details.
    globalSetup: "./vitest.setup.ts",
    // Integration tests against real SQL Server — sequential required
    // (multiple parallel tests modifying the same DB state causes flake)
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Timeout: real SQL Server queries can take a moment on cold start
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
