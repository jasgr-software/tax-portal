/**
 * apps/admin/src/test/setup.ts — Vitest test setup for Tax Portal (admin)
 *
 * Mirrors apps/portal/src/test/setup.ts (CLAUDE.md § Platform-frontend scope).
 * Extends vitest's `expect` with @testing-library/jest-dom matchers
 * (toBeInTheDocument, toHaveTextContent, etc.) for all component tests.
 *
 * Requires `globals: true` in vitest.config.ts so that vitest's global `expect`
 * is available when @testing-library/jest-dom calls `expect.extend(...)`.
 */

import "@testing-library/jest-dom";
import "@testing-library/jest-dom/vitest";
