/**
 * packages/db/vitest.setup.ts — globalSetup for packages/db Vitest suite
 *
 * DECISION (TASK-006): Loads .env.local from the repo root before any tests run
 * so that tier-3 integration tests pick up DATABASE_URL_ADMIN / DATABASE_URL
 * without requiring manual shell export. Uses Node 20+ built-in process.loadEnvFile().
 *
 * If .env.local is absent (CI injects secrets via GitHub Actions env block), the
 * catch silently skips — tests will skip/fail if the vars are genuinely missing,
 * which is the correct behavior.
 *
 * This is a globalSetup (not a setupFile) because it needs to run in the main
 * process where process.env mutations are visible to child forks.
 */

import { resolve } from "node:path";

export default function setup() {
  const envPath = resolve(__dirname, "../../.env.local");
  try {
    (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(envPath);
  } catch {
    // .env.local not present — CI provides env vars via the actions env block
  }
}
