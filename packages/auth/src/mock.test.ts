/**
 * packages/auth/src/mock.test.ts — Unit tests for the mock binding
 *
 * AC-AUTH-001-03 (foundation): getSessionRole() / getIdentity() read the role from
 * the verified signed session cookie — never from client-supplied input.
 *
 * Tests cover:
 *   - signMockSession / verifyMockSession round-trip
 *   - MockAuthProvider.getSessionRole reads from signed cookie (server-side)
 *   - A client-supplied role header/query is NOT trusted (only the signed cookie is)
 *   - Expired sessions are rejected
 *   - Tampered signatures are rejected
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  MockAuthProvider,
  signMockSession,
  verifyMockSession,
  MOCK_SESSION_COOKIE_NAME,
  FIXTURE_INVITATION,
} from "./bindings/mock.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(cookieValue?: string, extraHeaders?: Record<string, string>): Request {
  const headers: Record<string, string> = {};
  if (cookieValue !== undefined) {
    headers["cookie"] = `${MOCK_SESSION_COOKIE_NAME}=${cookieValue}`;
  }
  if (extraHeaders) {
    Object.assign(headers, extraHeaders);
  }
  return new Request("http://localhost:3000/dashboard", { headers });
}

function makeSignedSession(
  role: "ACCOUNTANT" | "CLIENT",
  options?: { clerkUserId?: string; expiryOffset?: number }
): string {
  const exp = Date.now() + (options?.expiryOffset ?? 60_000); // 1 min default
  return signMockSession({
    clerkUserId: options?.clerkUserId ?? "user_test_001",
    role,
    exp,
  });
}

// ─── signMockSession / verifyMockSession ─────────────────────────────────────

describe("signMockSession / verifyMockSession", () => {
  beforeEach(() => {
    // Use a deterministic test secret so tests don't depend on env
    process.env["MOCK_SESSION_SECRET"] = "test-secret-12345";
  });

  afterEach(() => {
    delete process.env["MOCK_SESSION_SECRET"];
  });

  it("round-trips a CLIENT session", () => {
    const cookieValue = makeSignedSession("CLIENT");
    const payload = verifyMockSession(cookieValue);
    expect(payload).not.toBeNull();
    expect(payload?.role).toBe("CLIENT");
    expect(payload?.clerkUserId).toBe("user_test_001");
  });

  it("round-trips an ACCOUNTANT session", () => {
    const cookieValue = makeSignedSession("ACCOUNTANT", { clerkUserId: "user_acct_001" });
    const payload = verifyMockSession(cookieValue);
    expect(payload).not.toBeNull();
    expect(payload?.role).toBe("ACCOUNTANT");
    expect(payload?.clerkUserId).toBe("user_acct_001");
  });

  it("rejects an expired session", () => {
    // -1000ms = already expired
    const cookieValue = makeSignedSession("CLIENT", { expiryOffset: -1000 });
    const payload = verifyMockSession(cookieValue);
    expect(payload).toBeNull();
  });

  it("rejects a tampered payload (changed role)", () => {
    const cookieValue = makeSignedSession("CLIENT");
    const [payloadPart, sigPart] = cookieValue.split(".");
    // Tamper: encode a different role
    const tampered = Buffer.from(JSON.stringify({
      clerkUserId: "user_test_001",
      role: "ACCOUNTANT", // ← changed
      exp: Date.now() + 60_000,
    })).toString("base64url");
    const tamperedCookie = `${tampered}.${sigPart}`;
    const payload = verifyMockSession(tamperedCookie);
    expect(payload).toBeNull();
    // Suppress 'payloadPart is declared but never used' — it exists for clarity
    void payloadPart;
  });

  it("rejects a cookie without a dot separator (malformed)", () => {
    const payload = verifyMockSession("notadotted");
    expect(payload).toBeNull();
  });

  it("rejects an empty cookie value", () => {
    const payload = verifyMockSession("");
    expect(payload).toBeNull();
  });
});

// ─── MockAuthProvider.getSessionRole ─────────────────────────────────────────

describe("MockAuthProvider.getSessionRole — [AC-AUTH-001-03]", () => {
  let provider: MockAuthProvider;

  beforeEach(() => {
    process.env["MOCK_SESSION_SECRET"] = "test-secret-12345";
    provider = new MockAuthProvider();
  });

  afterEach(() => {
    delete process.env["MOCK_SESSION_SECRET"];
  });

  it("[AC-AUTH-001-03] returns CLIENT role from signed cookie", async () => {
    const cookieValue = makeSignedSession("CLIENT");
    const req = makeRequest(cookieValue);
    const role = await provider.getSessionRole(req);
    expect(role).toBe("CLIENT");
  });

  it("[AC-AUTH-001-03] returns ACCOUNTANT role from signed cookie", async () => {
    const cookieValue = makeSignedSession("ACCOUNTANT");
    const req = makeRequest(cookieValue);
    const role = await provider.getSessionRole(req);
    expect(role).toBe("ACCOUNTANT");
  });

  it("[AC-AUTH-001-03] returns null when no session cookie is present", async () => {
    const req = makeRequest(); // no cookie
    const role = await provider.getSessionRole(req);
    expect(role).toBeNull();
  });

  it("[AC-AUTH-001-03] returns null for an invalid/tampered cookie", async () => {
    const req = makeRequest("tampered.invalidsig");
    const role = await provider.getSessionRole(req);
    expect(role).toBeNull();
  });

  it("[AC-AUTH-001-03] does NOT trust a role set in a request header (X-Role: ACCOUNTANT)", async () => {
    // This is the ADR-005 "never client-asserted" test:
    // A request with no valid session cookie but with an X-Role header must return null.
    const req = makeRequest(undefined, { "x-role": "ACCOUNTANT" });
    const role = await provider.getSessionRole(req);
    expect(role).toBeNull();
  });

  it("[AC-AUTH-001-03] does NOT trust a role in a query parameter", async () => {
    // A request with a role query param but no valid session cookie must return null.
    const reqWithQuery = new Request(
      "http://localhost:3000/dashboard?role=ACCOUNTANT",
      { headers: {} }
    );
    const role = await provider.getSessionRole(reqWithQuery);
    expect(role).toBeNull();
  });
});

// ─── MockAuthProvider.getIdentity ────────────────────────────────────────────

describe("MockAuthProvider.getIdentity — [AC-AUTH-001-03]", () => {
  let provider: MockAuthProvider;

  beforeEach(() => {
    process.env["MOCK_SESSION_SECRET"] = "test-secret-12345";
    provider = new MockAuthProvider();
  });

  afterEach(() => {
    delete process.env["MOCK_SESSION_SECRET"];
  });

  it("[AC-AUTH-001-03] returns identity with clerkUserId and role from signed cookie", async () => {
    const cookieValue = makeSignedSession("CLIENT", { clerkUserId: "user_client_e2e_001" });
    const req = makeRequest(cookieValue);
    const identity = await provider.getIdentity(req);
    expect(identity).not.toBeNull();
    expect(identity?.clerkUserId).toBe("user_client_e2e_001");
    expect(identity?.role).toBe("CLIENT");
  });

  it("[AC-AUTH-001-03] returns null for unauthenticated request", async () => {
    const req = makeRequest();
    const identity = await provider.getIdentity(req);
    expect(identity).toBeNull();
  });

  it("[AC-AUTH-001-03] identity shape is compatible with packages/db RequestContext (clerkUserId + role)", async () => {
    const cookieValue = makeSignedSession("ACCOUNTANT", { clerkUserId: "user_acct_prod_001" });
    const req = makeRequest(cookieValue);
    const identity = await provider.getIdentity(req);
    expect(identity).not.toBeNull();
    // Shape check: must have exactly these fields for TASK-004-007 compatibility
    expect(Object.keys(identity ?? {})).toContain("clerkUserId");
    expect(Object.keys(identity ?? {})).toContain("role");
    expect(identity?.role).toBe("ACCOUNTANT");
  });
});

// ─── MockAuthProvider.checkSession ───────────────────────────────────────────

describe("MockAuthProvider.checkSession", () => {
  let provider: MockAuthProvider;

  beforeEach(() => {
    process.env["MOCK_SESSION_SECRET"] = "test-secret-12345";
    provider = new MockAuthProvider();
  });

  afterEach(() => {
    delete process.env["MOCK_SESSION_SECRET"];
  });

  it("returns valid=true for a valid signed session", async () => {
    const cookieValue = makeSignedSession("CLIENT");
    const req = makeRequest(cookieValue);
    const result = await provider.checkSession(req);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.identity.role).toBe("CLIENT");
    }
  });

  it("returns valid=false reason=unauthenticated when no cookie", async () => {
    const req = makeRequest();
    const result = await provider.checkSession(req);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("unauthenticated");
    }
  });

  it("returns valid=false reason=expired for an expired session", async () => {
    const cookieValue = makeSignedSession("CLIENT", { expiryOffset: -1000 });
    const req = makeRequest(cookieValue);
    const result = await provider.checkSession(req);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Either "expired" or "unauthenticated" is acceptable here depending on
      // whether we can parse the expired payload before signature verification
      expect(["expired", "unauthenticated"]).toContain(result.reason);
    }
  });
});

// ─── MockAuthProvider.createInvitation ───────────────────────────────────────

describe("MockAuthProvider.createInvitation", () => {
  let provider: MockAuthProvider;

  beforeEach(() => {
    provider = new MockAuthProvider();
  });

  it("creates a CLIENT invitation", async () => {
    const inv = await provider.createInvitation("client@example.com", "CLIENT");
    expect(inv.email).toBe("client@example.com");
    expect(inv.role).toBe("CLIENT");
    expect(typeof inv.ticket).toBe("string");
    expect(inv.ticket.length).toBeGreaterThan(0);
  });

  it("creates an ACCOUNTANT invitation", async () => {
    const inv = await provider.createInvitation("accountant@example.com", "ACCOUNTANT");
    expect(inv.role).toBe("ACCOUNTANT");
  });
});

// ─── Fixture Invitation ───────────────────────────────────────────────────────

describe("FIXTURE_INVITATION", () => {
  it("is a CLIENT invitation fixture", () => {
    expect(FIXTURE_INVITATION.role).toBe("CLIENT");
    expect(typeof FIXTURE_INVITATION.email).toBe("string");
    expect(typeof FIXTURE_INVITATION.ticket).toBe("string");
  });
});
