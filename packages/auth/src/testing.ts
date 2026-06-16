/**
 * packages/auth/src/testing.ts — Test-only helpers for @tax-portal/auth
 *
 * Exports test utility functions that intentionally do NOT belong in the
 * public barrel (src/index.ts). Import from "@tax-portal/auth/testing" in
 * test files only — never in production code.
 *
 * (OE5 — review finding: test resets must not be in the public barrel.)
 */

export { createAuthProvider, resetAuthProviderForTesting } from "./select.js";
export { resetRateLimiterForTesting } from "./rate-limiter/in-memory.js";
