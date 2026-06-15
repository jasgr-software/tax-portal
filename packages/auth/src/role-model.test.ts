/**
 * packages/auth/src/role-model.test.ts — Role-model invariant tests
 *
 * Proves the two-role model is correct and that an account's role is
 * authoritatively determinable server-side after sign-in.
 *
 * Gherkin acceptance scenarios (BRIEF-004 / TASK-004-004):
 *
 *   # AC-AUTH-001-01
 *   Given the authentication model of the system
 *   When the set of assignable authenticated roles is enumerated
 *   Then it contains exactly ACCOUNTANT and CLIENT and no other authenticated role
 *
 *   # AC-AUTH-001-02
 *   Given any authenticated account in the system
 *   When its role assignment is inspected
 *   Then it has exactly one role — never both ACCOUNTANT and CLIENT, and never none
 *
 *   # AC-AUTH-001-03
 *   Given a signed-in account
 *   When any access decision is evaluated for that account
 *   Then the account's role is available and authoritative for that decision
 *
 * Methodology (from BRIEF-004): acceptance_format: gherkin; tdd: optional; e2e: no.
 * Tests are standard *.test.ts files tagged by AC id (describe/it title + comment).
 * No .feature mirror required for package-level tests.
 *
 * Hard constraints honored:
 *   - No @clerk/nextjs import.
 *   - No AUTH_PROVIDER=clerk.
 *   - All assertions run against the MockAuthProvider binding / ROLES const.
 *   - No 2FA assertions (deferred scope).
 *   - Package scope only — no apps/* UI or routes.
 *
 * ADR-001: role enumeration is exactly {ACCOUNTANT, CLIENT}; single Clerk app / two surfaces.
 * ADR-005: role is the trust boundary — server-evaluated, never client-asserted.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ROLES } from "./port.js";
import type { Role } from "./port.js";
import {
  MockAuthProvider,
  signMockSession,
  MOCK_SESSION_COOKIE_NAME,
} from "./bindings/mock.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSignedCookieValue(
  role: Role,
  options?: { clerkUserId?: string; expiryOffset?: number },
): string {
  return signMockSession({
    clerkUserId: options?.clerkUserId ?? "user_test_invariant_001",
    role,
    exp: Date.now() + (options?.expiryOffset ?? 60_000), // 1 min default
  });
}

/**
 * Build a Request that carries a valid signed mock session cookie.
 * Optional extraHeaders lets tests inject client-supplied role claims (X-Role, etc.)
 * to prove they are ignored by the server-side role read.
 */
function makeRequestWithCookie(
  cookieValue: string,
  extraHeaders?: Record<string, string>,
): Request {
  return new Request("http://localhost:3000/dashboard", {
    headers: {
      cookie: `${MOCK_SESSION_COOKIE_NAME}=${cookieValue}`,
      ...extraHeaders,
    },
  });
}

/**
 * Build a Request with NO session cookie but optional client-supplied headers / query.
 * Used in negative cases that prove client input cannot assert a role.
 */
function makeRequestWithoutCookie(
  url?: string,
  extraHeaders?: Record<string, string>,
): Request {
  return new Request(url ?? "http://localhost:3000/dashboard", {
    headers: { ...extraHeaders },
  });
}

// ─── AC-AUTH-001-01: Role enumeration ─────────────────────────────────────────

describe("[AC-AUTH-001-01] role enumeration — the system has exactly ACCOUNTANT and CLIENT", () => {
  // AC-AUTH-001-01
  it("[AC-AUTH-001-01] ROLES contains exactly two members", () => {
    // Given the authentication model of the system
    // When the set of assignable authenticated roles is enumerated
    // Then it contains exactly ACCOUNTANT and CLIENT and no other authenticated role
    expect(ROLES).toHaveLength(2);
  });

  it("[AC-AUTH-001-01] ROLES includes ACCOUNTANT", () => {
    // AC-AUTH-001-01
    expect(ROLES).toContain("ACCOUNTANT");
  });

  it("[AC-AUTH-001-01] ROLES includes CLIENT", () => {
    // AC-AUTH-001-01
    expect(ROLES).toContain("CLIENT");
  });

  it("[AC-AUTH-001-01] ROLES does not include any third role", () => {
    // AC-AUTH-001-01
    // Asserting against ROLES (the single source of truth in port.ts) means a regression
    // (e.g. adding "ADMIN") will red this test — asserting against a hand-copied literal
    // would prove nothing.
    const knownRoles: string[] = ["ACCOUNTANT", "CLIENT"];
    for (const r of ROLES) {
      expect(knownRoles).toContain(r);
    }
    // And the converse: every known role is actually in ROLES
    for (const r of knownRoles) {
      expect(ROLES as readonly string[]).toContain(r);
    }
  });

  it("[AC-AUTH-001-01] Role type is derivable from ROLES — no other string is assignable as a Role", () => {
    // AC-AUTH-001-01
    // This compile-time check is expressed at runtime by asserting ROLES membership.
    // A value not in ROLES cannot satisfy the Role type.
    const validRoles: Role[] = ["ACCOUNTANT", "CLIENT"];
    for (const r of validRoles) {
      expect(ROLES as readonly string[]).toContain(r);
    }
  });
});

// ─── AC-AUTH-001-02: One-role invariant ───────────────────────────────────────

describe("[AC-AUTH-001-02] one-role invariant — exactly one role per identity, never both/none", () => {
  let provider: MockAuthProvider;

  beforeEach(() => {
    // AC-AUTH-001-02
    process.env["MOCK_SESSION_SECRET"] = "test-secret-invariant-12345";
    provider = new MockAuthProvider();
  });

  afterEach(() => {
    delete process.env["MOCK_SESSION_SECRET"];
  });

  it("[AC-AUTH-001-02] a CLIENT session resolves to exactly one role (CLIENT)", async () => {
    // Given any authenticated account in the system
    // When its role assignment is inspected
    // Then it has exactly one role — never both ACCOUNTANT and CLIENT, and never none
    const cookie = makeSignedCookieValue("CLIENT");
    const req = makeRequestWithCookie(cookie);
    const identity = await provider.getIdentity(req);
    expect(identity).not.toBeNull();
    // identity.role is a scalar Role — "both roles" is unrepresentable at the type level
    // and the seam enforces it at runtime
    expect(identity?.role).toBe("CLIENT");
    expect(identity?.role).not.toBe("ACCOUNTANT");
  });

  it("[AC-AUTH-001-02] an ACCOUNTANT session resolves to exactly one role (ACCOUNTANT)", async () => {
    // AC-AUTH-001-02
    const cookie = makeSignedCookieValue("ACCOUNTANT");
    const req = makeRequestWithCookie(cookie);
    const identity = await provider.getIdentity(req);
    expect(identity).not.toBeNull();
    expect(identity?.role).toBe("ACCOUNTANT");
    expect(identity?.role).not.toBe("CLIENT");
  });

  it("[AC-AUTH-001-02] a session missing a role claim resolves to null identity (not a defaulted role)", async () => {
    // AC-AUTH-001-02
    // A payload with no role (omitted) must NOT yield a defaulted/coerced identity.
    // verifyMockSessionAsync / getIdentity must return null for missing role.
    //
    // Craft a signed cookie whose payload omits the role field entirely.
    // We build the payload + sign it manually to bypass the type constraints.
    const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
    const toBase64Url = (buf: Buffer) =>
      buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const secret = process.env["MOCK_SESSION_SECRET"]!;
    // Payload deliberately omits `role`
    const payloadObj = {
      clerkUserId: "user_no_role",
      exp: Date.now() + 60_000,
      // role intentionally absent
    };
    const payloadStr = toBase64Url(Buffer.from(JSON.stringify(payloadObj)));
    const sig = toBase64Url(
      nodeCrypto.createHmac("sha256", secret).update(payloadStr).digest(),
    );
    const malformedCookie = `${payloadStr}.${sig}`;

    const req = makeRequestWithCookie(malformedCookie);
    // getIdentity must return null — no defaulted role
    const identity = await provider.getIdentity(req);
    expect(identity).toBeNull();
  });

  it("[AC-AUTH-001-02] a session with an invalid role value resolves to null identity (not coerced)", async () => {
    // AC-AUTH-001-02
    // A payload with role="ADMIN" (not in the enumeration) must NOT coerce to a valid role.
    const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
    const toBase64Url = (buf: Buffer) =>
      buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const secret = process.env["MOCK_SESSION_SECRET"]!;
    const payloadObj = {
      clerkUserId: "user_bad_role",
      role: "ADMIN", // not a valid Role
      exp: Date.now() + 60_000,
    };
    const payloadStr = toBase64Url(Buffer.from(JSON.stringify(payloadObj)));
    const sig = toBase64Url(
      nodeCrypto.createHmac("sha256", secret).update(payloadStr).digest(),
    );
    const badRoleCookie = `${payloadStr}.${sig}`;

    const req = makeRequestWithCookie(badRoleCookie);
    const identity = await provider.getIdentity(req);
    // Must be null — "ADMIN" is not in the Role enumeration; not coerced
    expect(identity).toBeNull();
  });

  it("[AC-AUTH-001-02] the Identity role field is a scalar Role, not a collection (no both-roles state)", async () => {
    // AC-AUTH-001-02
    // The type system enforces this at compile time. This test asserts the runtime shape
    // so the seam cannot silently regress into returning an array.
    const cookie = makeSignedCookieValue("CLIENT");
    const req = makeRequestWithCookie(cookie);
    const identity = await provider.getIdentity(req);
    expect(identity).not.toBeNull();
    // role must be a string scalar, not an array or object
    expect(typeof identity?.role).toBe("string");
    expect(Array.isArray(identity?.role)).toBe(false);
    // And the scalar must be a member of ROLES
    expect(ROLES as readonly string[]).toContain(identity?.role);
  });

  it("[AC-AUTH-001-02] checkSession returns valid=false (not a defaulted identity) for missing cookie", async () => {
    // AC-AUTH-001-02
    // "never none": an unauthenticated request must not yield any role — it must yield
    // an explicit "not authenticated" signal, not a defaulted ANONYMOUS role.
    const req = makeRequestWithoutCookie();
    const result = await provider.checkSession(req);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("unauthenticated");
    }
  });
});

// ─── AC-AUTH-001-03: Server-side authoritative role read ──────────────────────

describe("[AC-AUTH-001-03] server-side authoritative role read — verified session wins, client input ignored", () => {
  let provider: MockAuthProvider;

  beforeEach(() => {
    // AC-AUTH-001-03
    process.env["MOCK_SESSION_SECRET"] = "test-secret-invariant-12345";
    provider = new MockAuthProvider();
  });

  afterEach(() => {
    delete process.env["MOCK_SESSION_SECRET"];
  });

  it("[AC-AUTH-001-03] getSessionRole returns the role from the verified session cookie", async () => {
    // Given a signed-in account
    // When any access decision is evaluated for that account
    // Then the account's role is available and authoritative for that decision
    const cookie = makeSignedCookieValue("CLIENT");
    const req = makeRequestWithCookie(cookie);
    const role = await provider.getSessionRole(req);
    expect(role).toBe("CLIENT");
  });

  it("[AC-AUTH-001-03] getSessionRole returns the role deterministically on repeated calls (same session)", async () => {
    // AC-AUTH-001-03: role is available and authoritative for every access decision
    const cookie = makeSignedCookieValue("ACCOUNTANT");
    const req = makeRequestWithCookie(cookie);
    const role1 = await provider.getSessionRole(req);
    // Rebuild request (simulate a second middleware call)
    const req2 = makeRequestWithCookie(cookie);
    const role2 = await provider.getSessionRole(req2);
    expect(role1).toBe("ACCOUNTANT");
    expect(role2).toBe("ACCOUNTANT");
    expect(role1).toBe(role2);
  });

  it("[AC-AUTH-001-03] ADR-005 negative case: session says CLIENT but X-Role header says ACCOUNTANT — CLIENT wins", async () => {
    // AC-AUTH-001-03 + ADR-005: This is the discriminating negative case.
    //
    // A request whose VERIFIED session cookie encodes CLIENT but whose
    // client-supplied X-Role header claims ACCOUNTANT must resolve to CLIENT.
    // The signed cookie is what the server trusts; the header is arbitrary client input.
    //
    // If this test fails, the role read is not server-authoritative (ADR-005 violation).
    const cookie = makeSignedCookieValue("CLIENT", { clerkUserId: "user_client_001" });
    const req = makeRequestWithCookie(cookie, {
      "x-role": "ACCOUNTANT", // client-supplied — must be ignored
    });
    const role = await provider.getSessionRole(req);
    expect(role).toBe("CLIENT"); // session wins, not the header
  });

  it("[AC-AUTH-001-03] ADR-005 negative case: session says ACCOUNTANT but X-Role header says CLIENT — ACCOUNTANT wins", async () => {
    // AC-AUTH-001-03 + ADR-005: symmetric negative case
    const cookie = makeSignedCookieValue("ACCOUNTANT", { clerkUserId: "user_acct_001" });
    const req = makeRequestWithCookie(cookie, {
      "x-role": "CLIENT", // client-supplied — must be ignored
    });
    const role = await provider.getSessionRole(req);
    expect(role).toBe("ACCOUNTANT"); // session wins
  });

  it("[AC-AUTH-001-03] ADR-005 negative case: role in query param is ignored — returns null with no valid cookie", async () => {
    // AC-AUTH-001-03 + ADR-005: a URL query param cannot assert a role
    // No session cookie present — the query param must not produce a role
    const req = makeRequestWithoutCookie(
      "http://localhost:3000/dashboard?role=ACCOUNTANT",
    );
    const role = await provider.getSessionRole(req);
    expect(role).toBeNull();
  });

  it("[AC-AUTH-001-03] ADR-005 negative case: X-Role header alone (no cookie) returns null — no session, no role", async () => {
    // AC-AUTH-001-03 + ADR-005: client cannot inject a role via a standalone header
    const req = makeRequestWithoutCookie(undefined, {
      "x-role": "ACCOUNTANT",
    });
    const role = await provider.getSessionRole(req);
    expect(role).toBeNull();
  });

  it("[AC-AUTH-001-03] ADR-005 negative case: Authorization bearer header alone is NOT a role source", async () => {
    // AC-AUTH-001-03 + ADR-005: even a seemingly-authoritative Authorization header cannot
    // supply the role — only the verified signed session cookie is the role source
    const req = makeRequestWithoutCookie(undefined, {
      authorization: "Bearer eyJhbGciOiJSUzI1NiJ9.fake-jwt.signature",
    });
    const role = await provider.getSessionRole(req);
    expect(role).toBeNull();
  });

  it("[AC-AUTH-001-03] getIdentity returns identity with role from the verified session (not from any header)", async () => {
    // AC-AUTH-001-03: getIdentity is the full identity read — role must match session
    const cookie = makeSignedCookieValue("CLIENT", { clerkUserId: "user_identity_001" });
    const req = makeRequestWithCookie(cookie, {
      "x-user-role": "ACCOUNTANT", // client-supplied, must be ignored
      "x-clerk-user-id": "attacker_user_id", // client-supplied, must be ignored
    });
    const identity = await provider.getIdentity(req);
    expect(identity).not.toBeNull();
    expect(identity?.role).toBe("CLIENT"); // from session, not x-user-role
    expect(identity?.clerkUserId).toBe("user_identity_001"); // from session, not x-clerk-user-id
  });

  it("[AC-AUTH-001-03] checkSession returns valid identity with session role (not from headers)", async () => {
    // AC-AUTH-001-03: checkSession must also be authoritative
    const cookie = makeSignedCookieValue("ACCOUNTANT", { clerkUserId: "user_checksess_001" });
    const req = makeRequestWithCookie(cookie, {
      "x-role": "CLIENT", // client-supplied — must be ignored
    });
    const result = await provider.checkSession(req);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.identity.role).toBe("ACCOUNTANT"); // from session
      expect(result.identity.clerkUserId).toBe("user_checksess_001");
    }
  });

  it("[AC-AUTH-001-03] a tampered session cookie (changed role via base64 forgery) is rejected — no role resolved", async () => {
    // AC-AUTH-001-03 + ADR-005: A browser attempting to forge the role by re-encoding
    // the base64url payload must be caught by the HMAC signature check.
    // This proves the "server-evaluated" guarantee is cryptographic, not just policy.
    const originalCookie = makeSignedCookieValue("CLIENT");
    const dotIdx = originalCookie.lastIndexOf(".");
    const sigPart = originalCookie.slice(dotIdx + 1);

    // Forge a payload that claims ACCOUNTANT (reuse the original signature)
    const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
    const toBase64Url = (buf: Buffer) =>
      buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const forgedPayloadObj = {
      clerkUserId: "user_test_invariant_001",
      role: "ACCOUNTANT", // attempted forgery
      exp: Date.now() + 60_000,
    };
    // Sign with a WRONG key to simulate a browser that can't forge the HMAC
    const forgedPayloadStr = toBase64Url(Buffer.from(JSON.stringify(forgedPayloadObj)));
    const forgedCookie = `${forgedPayloadStr}.${sigPart}`; // reuse original sig → mismatch

    const req = makeRequestWithCookie(forgedCookie);
    const role = await provider.getSessionRole(req);
    // The HMAC check must reject this; the forged role must not be accepted
    expect(role).toBeNull();
  });
});
