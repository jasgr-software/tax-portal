/**
 * apps/admin/e2e/fixtures/auth.ts — Auth fixture helpers for Tax Portal (admin) e2e
 *
 * Provides helpers for e2e tests to establish mock sessions via the
 * /api/mock-session endpoint (active when AUTH_PROVIDER=mock).
 *
 * ADR-005: Role is set SERVER-SIDE by the mock-session endpoint (signed cookie).
 * The browser receives the signed cookie but cannot manufacture a valid signature.
 * Test harness calls this fixture to establish a valid ACCOUNTANT or CLIENT session.
 *
 * TASK-004-002: minimal seam proof — these fixtures drive the redirect matrix e2e tests.
 * The full cross-app fixture suite (sign-in page flow, session continuity, sign-out)
 * is TASK-004-008.
 */

import { type Page, type APIRequestContext } from "@playwright/test";
import { MOCK_SESSION_COOKIE_NAME } from "@tax-portal/auth";

// ─── Session fixture helpers ──────────────────────────────────────────────────

interface MockSessionBody {
  clerkUserId: string;
  role: "ACCOUNTANT" | "CLIENT";
}

/**
 * POST to /api/mock-session on the admin app to create a signed session cookie.
 * Returns the Set-Cookie header value so the test can inject it into the browser context.
 *
 * Requires AUTH_PROVIDER=mock to be set in the container environment.
 */
async function createMockSession(
  request: APIRequestContext,
  baseUrl: string,
  body: MockSessionBody,
): Promise<string> {
  const response = await request.post(`${baseUrl}/api/mock-session`, {
    data: body,
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(
      `[auth fixture] /api/mock-session returned ${response.status()}: ${text}. ` +
        `Is AUTH_PROVIDER=mock set in the container? Is the mock-session route active?`,
    );
  }

  const setCookieHeader = response.headers()["set-cookie"];
  if (!setCookieHeader) {
    throw new Error("[auth fixture] /api/mock-session did not return Set-Cookie header");
  }
  return setCookieHeader;
}

/**
 * Parse a Set-Cookie header string into cookie name/value parts
 * suitable for Playwright's addCookies().
 */
function parseCookieForPlaywright(
  setCookieHeader: string,
  domain: string,
): { name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: "Lax" | "Strict" | "None" } {
  const parts = setCookieHeader.split(";").map((p) => p.trim());
  const [nameValue, ...attrs] = parts;
  const eqIdx = (nameValue ?? "").indexOf("=");
  const name = (nameValue ?? "").slice(0, eqIdx);
  const value = (nameValue ?? "").slice(eqIdx + 1);

  const attrMap: Record<string, string> = {};
  for (const attr of attrs) {
    const eqI = attr.indexOf("=");
    if (eqI === -1) {
      attrMap[attr.toLowerCase()] = "true";
    } else {
      attrMap[attr.slice(0, eqI).toLowerCase()] = attr.slice(eqI + 1);
    }
  }

  return {
    name,
    value,
    domain,
    path: attrMap["path"] ?? "/",
    httpOnly: "httponly" in attrMap,
    sameSite: (attrMap["samesite"] as "Lax" | "Strict" | "None" | undefined) ?? "Lax",
  };
}

// ─── Exported fixture helpers ─────────────────────────────────────────────────

// Derive admin base URL from ADMIN_BASE_URL or ADMIN_PORT (docker-compose port mapping).
// Mirrors playwright.config.ts so the fixture always targets the same host as the test runner.
const ADMIN_PORT_ENV = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_BASE_URL =
  process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT_ENV}`;
const ADMIN_DOMAIN = new URL(ADMIN_BASE_URL).hostname;

/**
 * Set up an ACCOUNTANT session on the admin app for a Playwright page.
 * Calls /api/mock-session on admin, injects the signed cookie into the browser context.
 *
 * Usage in a test:
 *   const { page } = await setupAccountantSession(page, request);
 *   await page.goto("/");
 */
export async function setupAccountantSession(
  page: Page,
  request: APIRequestContext,
  clerkUserId = "user_accountant_e2e_001",
): Promise<void> {
  const setCookieHeader = await createMockSession(request, ADMIN_BASE_URL, {
    clerkUserId,
    role: "ACCOUNTANT",
  });
  const cookie = parseCookieForPlaywright(setCookieHeader, ADMIN_DOMAIN);
  await page.context().addCookies([cookie]);
}

/**
 * Set up a CLIENT session on the admin app for a Playwright page.
 * Used to test the redirect-to-portal behavior (AC-AUTH-010-02 seam proof).
 *
 * Note: A CLIENT session is created ON THE PORTAL and the cookie is shared
 * because both apps share localhost. However, the mock-session endpoint
 * is called on the admin app here (the cookie domain is localhost in all cases).
 */
export async function setupClientSession(
  page: Page,
  request: APIRequestContext,
  clerkUserId = "user_client_e2e_001",
): Promise<void> {
  const setCookieHeader = await createMockSession(request, ADMIN_BASE_URL, {
    clerkUserId,
    role: "CLIENT",
  });
  const cookie = parseCookieForPlaywright(setCookieHeader, ADMIN_DOMAIN);
  await page.context().addCookies([cookie]);
}

/**
 * Clear the mock session cookie from the browser context.
 */
export async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies({ name: MOCK_SESSION_COOKIE_NAME });
}
