/**
 * packages/auth/src/redirect.test.ts — Unit tests for the ADR-010 redirect helper
 *
 * AC-AUTH-010-01 (foundation): portal CLIENT-only route + signed-in ACCOUNTANT ⇒ redirect to admin
 * AC-AUTH-010-02 (foundation): admin route + signed-in CLIENT ⇒ redirect to portal
 * AC-AUTH-010-03 (foundation): portal public route + signed-in ACCOUNTANT ⇒ SERVE (no redirect)
 *
 * These tests cover the redirect-matrix LOGIC (pure functions); the exhaustive
 * cross-app e2e matrix lives in TASK-004-008.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isPortalPublicPath,
  isInfraPath,
  portalRedirectDecision,
  adminRedirectDecision,
} from "./redirect.js";

// ─── Public path matcher ──────────────────────────────────────────────────────

describe("isPortalPublicPath", () => {
  it("matches root /", () => {
    expect(isPortalPublicPath("/")).toBe(true);
  });

  it("matches /services", () => {
    expect(isPortalPublicPath("/services")).toBe(true);
  });

  it("matches /request", () => {
    expect(isPortalPublicPath("/request")).toBe(true);
  });

  it("matches /sign-in", () => {
    expect(isPortalPublicPath("/sign-in")).toBe(true);
  });

  it("matches /sign-up", () => {
    expect(isPortalPublicPath("/sign-up")).toBe(true);
  });

  it("matches /sign-in sub-paths (e.g. Clerk factor-one)", () => {
    expect(isPortalPublicPath("/sign-in/factor-one")).toBe(true);
  });

  it("matches /sign-up sub-paths", () => {
    expect(isPortalPublicPath("/sign-up/continue")).toBe(true);
  });

  it("does NOT match /dashboard (private route)", () => {
    expect(isPortalPublicPath("/dashboard")).toBe(false);
  });

  it("does NOT match /engagements (private route)", () => {
    expect(isPortalPublicPath("/engagements")).toBe(false);
  });

  it("does NOT match /settings (private route)", () => {
    expect(isPortalPublicPath("/settings")).toBe(false);
  });

  it("strips query string before matching", () => {
    expect(isPortalPublicPath("/services?foo=bar")).toBe(true);
  });
});

// ─── Infra path matcher ───────────────────────────────────────────────────────

describe("isInfraPath", () => {
  it("matches /healthz", () => {
    expect(isInfraPath("/healthz")).toBe(true);
  });

  it("matches /readyz", () => {
    expect(isInfraPath("/readyz")).toBe(true);
  });

  it("does NOT match /health (typo)", () => {
    expect(isInfraPath("/health")).toBe(false);
  });

  it("does NOT match / (root)", () => {
    expect(isInfraPath("/")).toBe(false);
  });
});

// ─── Portal redirect decision ─────────────────────────────────────────────────

describe("portalRedirectDecision — AC-AUTH-010-* foundation", () => {
  const baseUrl = "http://localhost:3000/dashboard";

  beforeEach(() => {
    process.env["PORTAL_APP_URL"] = "http://localhost:3000";
    process.env["ADMIN_APP_URL"] = "http://localhost:3001";
  });

  afterEach(() => {
    delete process.env["PORTAL_APP_URL"];
    delete process.env["ADMIN_APP_URL"];
  });

  // ─ Infrastructure paths always pass ─────────────────────────────────────────

  it("always serves /healthz regardless of identity", () => {
    const result = portalRedirectDecision("/healthz", null, baseUrl);
    expect(result.action).toBe("serve");
  });

  it("always serves /readyz regardless of identity", () => {
    const result = portalRedirectDecision("/readyz", { role: "CLIENT" }, baseUrl);
    expect(result.action).toBe("serve");
  });

  // ─ API routes always pass through (auth handled by route handler) ───────────

  it("always serves /api/* regardless of identity (API pass-through)", () => {
    const result = portalRedirectDecision("/api/mock-session", null, baseUrl);
    expect(result.action).toBe("serve");
  });

  it("always serves /api/* for authenticated users (API pass-through)", () => {
    const result = portalRedirectDecision("/api/some-route", { role: "ACCOUNTANT" }, baseUrl);
    expect(result.action).toBe("serve");
  });

  // ─ Public routes served for any role (AC-AUTH-010-03) ───────────────────────

  it("[AC-AUTH-010-03] serves public route / for unauthenticated", () => {
    const result = portalRedirectDecision("/", null, "http://localhost:3000/");
    expect(result.action).toBe("serve");
  });

  it("[AC-AUTH-010-03] serves /services for signed-in ACCOUNTANT — no redirect", () => {
    // This is the key AC-AUTH-010-03 assertion: ACCOUNTANT on PUBLIC portal route → SERVE
    const result = portalRedirectDecision("/services", { role: "ACCOUNTANT" }, "http://localhost:3000/services");
    expect(result.action).toBe("serve");
  });

  it("[AC-AUTH-010-03] serves /request for signed-in ACCOUNTANT — no redirect", () => {
    const result = portalRedirectDecision("/request", { role: "ACCOUNTANT" }, "http://localhost:3000/request");
    expect(result.action).toBe("serve");
  });

  it("[AC-AUTH-010-03] serves /sign-in for unauthenticated — no redirect loop", () => {
    const result = portalRedirectDecision("/sign-in", null, "http://localhost:3000/sign-in");
    expect(result.action).toBe("serve");
  });

  it("[AC-AUTH-010-03] serves /sign-in for signed-in ACCOUNTANT", () => {
    const result = portalRedirectDecision("/sign-in", { role: "ACCOUNTANT" }, "http://localhost:3000/sign-in");
    expect(result.action).toBe("serve");
  });

  // ─ Unauthenticated on private route → redirect to portal sign-in ─────────────

  it("redirects unauthenticated to /sign-in for private portal route", () => {
    const result = portalRedirectDecision("/dashboard", null, "http://localhost:3000/dashboard");
    expect(result.action).toBe("redirect");
    if (result.action === "redirect") {
      expect(result.destination.pathname).toBe("/sign-in");
      expect(result.destination.origin).toBe("http://localhost:3000");
      expect(result.destination.searchParams.get("redirect_url")).toBe("http://localhost:3000/dashboard");
      expect(result.statusCode).toBe(307);
    }
  });

  // ─ ACCOUNTANT on private portal route → redirect to admin (AC-AUTH-010-01 foundation) ──

  it("[AC-AUTH-010-01 foundation] redirects ACCOUNTANT to admin home on private portal route", () => {
    const result = portalRedirectDecision("/engagements", { role: "ACCOUNTANT" }, "http://localhost:3000/engagements");
    expect(result.action).toBe("redirect");
    if (result.action === "redirect") {
      expect(result.destination.origin).toBe("http://localhost:3001");
      expect(result.destination.pathname).toBe("/");
      expect(result.statusCode).toBe(307);
    }
  });

  it("[AC-AUTH-010-01 foundation] redirects ACCOUNTANT to admin home on /settings", () => {
    const result = portalRedirectDecision("/settings", { role: "ACCOUNTANT" }, "http://localhost:3000/settings");
    expect(result.action).toBe("redirect");
    if (result.action === "redirect") {
      expect(result.destination.origin).toBe("http://localhost:3001");
    }
  });

  // ─ CLIENT on private portal route → serve ─────────────────────────────────────

  it("serves private portal route for signed-in CLIENT", () => {
    const result = portalRedirectDecision("/dashboard", { role: "CLIENT" }, "http://localhost:3000/dashboard");
    expect(result.action).toBe("serve");
  });

  it("serves /engagements for signed-in CLIENT", () => {
    const result = portalRedirectDecision("/engagements", { role: "CLIENT" }, "http://localhost:3000/engagements");
    expect(result.action).toBe("serve");
  });
});

// ─── Admin redirect decision ──────────────────────────────────────────────────

describe("adminRedirectDecision — AC-AUTH-010-* foundation", () => {
  const baseUrl = "http://localhost:3001/dashboard";

  beforeEach(() => {
    process.env["PORTAL_APP_URL"] = "http://localhost:3000";
    process.env["ADMIN_APP_URL"] = "http://localhost:3001";
  });

  afterEach(() => {
    delete process.env["PORTAL_APP_URL"];
    delete process.env["ADMIN_APP_URL"];
  });

  // ─ Infrastructure paths always pass ─────────────────────────────────────────

  it("always serves /healthz regardless of identity", () => {
    const result = adminRedirectDecision("/healthz", null, baseUrl);
    expect(result.action).toBe("serve");
  });

  it("always serves /readyz regardless of identity", () => {
    const result = adminRedirectDecision("/readyz", { role: "ACCOUNTANT" }, baseUrl);
    expect(result.action).toBe("serve");
  });

  // ─ API routes always pass through (auth handled by route handler) ───────────

  it("always serves /api/* regardless of identity (API pass-through)", () => {
    const result = adminRedirectDecision("/api/mock-session", null, baseUrl);
    expect(result.action).toBe("serve");
  });

  it("always serves /api/* for authenticated users (API pass-through)", () => {
    const result = adminRedirectDecision("/api/some-route", { role: "CLIENT" }, baseUrl);
    expect(result.action).toBe("serve");
  });

  // ─ Sign-in path always accessible ─────────────────────────────────────────────

  it("serves admin /sign-in for unauthenticated (no redirect loop)", () => {
    const result = adminRedirectDecision("/sign-in", null, "http://localhost:3001/sign-in");
    expect(result.action).toBe("serve");
  });

  it("serves admin /sign-in sub-paths for unauthenticated", () => {
    const result = adminRedirectDecision("/sign-in/factor-one", null, "http://localhost:3001/sign-in/factor-one");
    expect(result.action).toBe("serve");
  });

  // ─ Unauthenticated on admin route → redirect to admin sign-in ─────────────────

  it("redirects unauthenticated to admin /sign-in for any admin route", () => {
    const result = adminRedirectDecision("/", null, "http://localhost:3001/");
    expect(result.action).toBe("redirect");
    if (result.action === "redirect") {
      expect(result.destination.pathname).toBe("/sign-in");
      expect(result.destination.origin).toBe("http://localhost:3001");
      expect(result.statusCode).toBe(307);
    }
  });

  it("redirects unauthenticated with redirect_url parameter", () => {
    const result = adminRedirectDecision("/dashboard", null, "http://localhost:3001/dashboard");
    expect(result.action).toBe("redirect");
    if (result.action === "redirect") {
      expect(result.destination.searchParams.get("redirect_url")).toBe("http://localhost:3001/dashboard");
    }
  });

  // ─ CLIENT on admin route → redirect to portal (AC-AUTH-010-02 foundation) ──────

  it("[AC-AUTH-010-02 foundation] redirects CLIENT to portal home on admin route", () => {
    const result = adminRedirectDecision("/", { role: "CLIENT" }, "http://localhost:3001/");
    expect(result.action).toBe("redirect");
    if (result.action === "redirect") {
      expect(result.destination.origin).toBe("http://localhost:3000");
      expect(result.destination.pathname).toBe("/");
      expect(result.statusCode).toBe(307);
    }
  });

  it("[AC-AUTH-010-02 foundation] redirects CLIENT from /engagements (admin) to portal", () => {
    const result = adminRedirectDecision("/engagements", { role: "CLIENT" }, "http://localhost:3001/engagements");
    expect(result.action).toBe("redirect");
    if (result.action === "redirect") {
      expect(result.destination.origin).toBe("http://localhost:3000");
    }
  });

  // ─ ACCOUNTANT on admin route → serve ──────────────────────────────────────────

  it("serves admin routes for signed-in ACCOUNTANT", () => {
    const result = adminRedirectDecision("/", { role: "ACCOUNTANT" }, "http://localhost:3001/");
    expect(result.action).toBe("serve");
  });

  it("serves /dashboard for signed-in ACCOUNTANT", () => {
    const result = adminRedirectDecision("/dashboard", { role: "ACCOUNTANT" }, "http://localhost:3001/dashboard");
    expect(result.action).toBe("serve");
  });

  it("serves /requests for signed-in ACCOUNTANT", () => {
    const result = adminRedirectDecision("/requests", { role: "ACCOUNTANT" }, "http://localhost:3001/requests");
    expect(result.action).toBe("serve");
  });
});
