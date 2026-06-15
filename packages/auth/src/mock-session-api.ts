/**
 * packages/auth/src/mock-session-api.ts — Mock session cookie builder for test fixtures
 *
 * Provides helpers for e2e test fixtures and Next.js route handlers to create
 * a valid signed mock session cookie. This module is only useful when AUTH_PROVIDER=mock.
 *
 * Used by:
 *   - apps/portal/src/app/api/mock-session/route.ts (test fixture endpoint)
 *   - apps/admin/src/app/api/mock-session/route.ts (test fixture endpoint)
 *   - e2e fixtures that set cookies directly via Playwright's browser context
 *
 * Security:
 *   - The route handlers that use this module MUST only be active when AUTH_PROVIDER=mock.
 *     They MUST return 404 when AUTH_PROVIDER=clerk.
 *   - MOCK_SESSION_SECRET must be a strong secret in e2e environments and must
 *     never be set in a real production environment.
 *
 * ADR-005: Even in test sessions, the role comes from the SIGNED COOKIE
 * (server-created), not from an arbitrary request input the browser can set.
 * The test fixture creates the cookie; the mock binding verifies the signature.
 */

import {
  signMockSessionAsync,
  DEFAULT_MOCK_SESSION_TIMEOUT_MS,
  MOCK_SESSION_COOKIE_NAME,
} from "./bindings/mock.js";
import type { Role } from "./port.js";

// ─── Session Creation ─────────────────────────────────────────────────────────

export interface MockSessionOptions {
  clerkUserId: string;
  role: Role;
  /** Custom session duration in ms. Defaults to DEFAULT_MOCK_SESSION_TIMEOUT_MS. */
  durationMs?: number;
}

export interface MockSessionCookie {
  /** Cookie name — MOCK_SESSION_COOKIE_NAME */
  name: string;
  /** Signed cookie value */
  value: string;
  /** Cookie attributes for Set-Cookie header */
  httpOnly: boolean;
  sameSite: "Lax" | "Strict" | "None";
  path: string;
  /** Expiry as a Date object (for Set-Cookie max-age / expires) */
  expires: Date;
}

/**
 * Create a signed mock session cookie for a test/fixture user.
 * Async: uses Web Crypto API (Edge Runtime compatible).
 *
 * @param options Session options (clerkUserId, role, optional durationMs)
 * @returns Cookie descriptor with name, value, and attributes
 */
export async function createMockSessionCookie(
  options: MockSessionOptions,
): Promise<MockSessionCookie> {
  const durationMs = options.durationMs ?? DEFAULT_MOCK_SESSION_TIMEOUT_MS;
  const exp = Date.now() + durationMs;
  const payload = {
    clerkUserId: options.clerkUserId,
    role: options.role,
    exp,
  };
  const value = await signMockSessionAsync(payload);
  return {
    name: MOCK_SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    expires: new Date(exp),
  };
}

/**
 * Build the Set-Cookie header string for a mock session.
 * Used in route handlers that issue mock sessions for e2e test setup.
 * Async: uses Web Crypto API.
 *
 * @param options Session options
 * @returns Set-Cookie header value string
 */
export async function buildMockSessionSetCookieHeader(
  options: MockSessionOptions,
): Promise<string> {
  const cookie = await createMockSessionCookie(options);
  const maxAgeSecs = Math.floor((cookie.expires.getTime() - Date.now()) / 1000);
  return [
    `${cookie.name}=${cookie.value}`,
    `Path=${cookie.path}`,
    `Max-Age=${maxAgeSecs}`,
    `HttpOnly`,
    `SameSite=${cookie.sameSite}`,
  ].join("; ");
}

/**
 * MOCK_SESSION_COOKIE_NAME re-export for consumers of this helper.
 */
export { MOCK_SESSION_COOKIE_NAME };
