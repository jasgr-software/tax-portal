/**
 * apps/portal/e2e/fixtures/auth.ts — Auth fixture helpers for Client Portal e2e
 *
 * Mirrors apps/admin/e2e/fixtures/auth.ts
 * (CLAUDE.md § Platform-frontend scope — both surfaces must have parity).
 *
 * Provides helpers for e2e tests to establish mock sessions via the
 * /api/mock-session endpoint (active when AUTH_PROVIDER=mock).
 *
 * ADR-005: Role is set SERVER-SIDE by the mock-session endpoint (signed cookie).
 * TASK-004-002: minimal seam proof fixtures — the full cross-app suite is TASK-004-008.
 */

import { type Page, type APIRequestContext } from "@playwright/test";
import { MOCK_SESSION_COOKIE_NAME } from "@tax-portal/auth";

// ─── Session fixture helpers ──────────────────────────────────────────────────

interface MockSessionBody {
  clerkUserId: string;
  role: "ACCOUNTANT" | "CLIENT";
}

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

const PORTAL_BASE_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const PORTAL_DOMAIN = new URL(PORTAL_BASE_URL).hostname;

/**
 * Set up a CLIENT session on the portal app for a Playwright page.
 * Calls /api/mock-session on portal, injects the signed cookie into the browser context.
 */
export async function setupClientSession(
  page: Page,
  request: APIRequestContext,
  clerkUserId = "user_client_e2e_001",
): Promise<void> {
  const setCookieHeader = await createMockSession(request, PORTAL_BASE_URL, {
    clerkUserId,
    role: "CLIENT",
  });
  const cookie = parseCookieForPlaywright(setCookieHeader, PORTAL_DOMAIN);
  await page.context().addCookies([cookie]);
}

/**
 * Set up an ACCOUNTANT session on the portal app for a Playwright page.
 * Used to test that ACCOUNTANT on public portal routes IS served (AC-AUTH-010-03).
 */
export async function setupAccountantSession(
  page: Page,
  request: APIRequestContext,
  clerkUserId = "user_accountant_e2e_001",
): Promise<void> {
  const setCookieHeader = await createMockSession(request, PORTAL_BASE_URL, {
    clerkUserId,
    role: "ACCOUNTANT",
  });
  const cookie = parseCookieForPlaywright(setCookieHeader, PORTAL_DOMAIN);
  await page.context().addCookies([cookie]);
}

/**
 * Clear the mock session cookie from the browser context.
 */
export async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies({ name: MOCK_SESSION_COOKIE_NAME });
}
