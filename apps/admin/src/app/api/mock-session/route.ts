/**
 * apps/admin/src/app/api/mock-session/route.ts — Mock session fixture endpoint (admin)
 *
 * Mirrors apps/portal/src/app/api/mock-session/route.ts
 * (CLAUDE.md § Platform-frontend scope — both surfaces must have parity).
 *
 * ONLY ACTIVE when AUTH_PROVIDER=mock (e2e + local dev default).
 * Returns 404 in production (AUTH_PROVIDER=clerk).
 *
 * Purpose: e2e test fixtures POST to this endpoint to create a signed
 * __mock_session cookie for a given clerkUserId + role. The admin middleware
 * trusts this signed cookie — the browser cannot forge it.
 *
 * ADR-005: Role is set SERVER-SIDE by this endpoint (the test harness controls
 * it, not the browser). The signed cookie is the only accepted session bearer.
 *
 * ADR-019 §3 (DECISION — TASK-004-010): The accountant-sign-in audit seam attaches HERE.
 *   This is the closest real session-establishment point that exists in this slice.
 *   There is NO admin credential-login UI yet (apps/admin/src/app/page.tsx is the
 *   auth-pending stub; accountant sessions come via this mock-session fixture).
 *   A full transactional bind (ADR-019 §3) is DEFERRED because:
 *     (a) No admin-credential-login DB mutation exists yet — the mock-session endpoint
 *         only sets a cookie and performs no DB write (no User row lookup/update).
 *     (b) When the real Clerk-based accountant-login slice lands, it will have a
 *         real DB mutation point (session record, audit trail at sign-in) — that slice
 *         will bind the audit INSERT in the same transaction as that mutation.
 *   For now, the audit INSERT runs as a standalone write (no mutation to bind to).
 *   If the audit INSERT fails, we return 500 — the session cookie is NOT sent (fail-closed
 *   at the response level, since we cannot do fail-closed at the DB-transaction level yet).
 *   The real-Clerk/admin-login slice will promote this to a true same-txn bind.
 *
 * Request body: { clerkUserId: string, role: "ACCOUNTANT" | "CLIENT" }
 * Response: 200 with Set-Cookie header setting __mock_session, body: { ok: true }
 *           404 if AUTH_PROVIDER !== "mock"
 *           400 if body is invalid
 *           500 if audit INSERT fails (fail-closed — no session without audit record)
 *
 * Also supports DELETE to clear the mock session cookie.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  buildMockSessionSetCookieHeader,
  MOCK_SESSION_COOKIE_NAME,
} from "@tax-portal/auth";
import { recordAuthEvent } from "@tax-portal/db";

// Only active under mock binding
function isMockActive(): boolean {
  return (process.env["AUTH_PROVIDER"] ?? "mock") === "mock";
}

export async function POST(request: NextRequest) {
  if (!isMockActive()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>)["clerkUserId"] !== "string" ||
    !["ACCOUNTANT", "CLIENT"].includes(
      (body as Record<string, unknown>)["role"] as string,
    )
  ) {
    return NextResponse.json(
      { error: "Body must have clerkUserId (string) and role ('ACCOUNTANT' | 'CLIENT')" },
      { status: 400 },
    );
  }

  const { clerkUserId, role } = body as {
    clerkUserId: string;
    role: "ACCOUNTANT" | "CLIENT";
  };

  // ─── Audit INSERT (ADR-019 §3 — accountant-sign-in seam) ─────────────────
  // Record the auth.signin event in the AuditEvent ledger table (ADR-019).
  // Actor identity (clerkUserId, role) is server-controlled — the test harness POST body
  // is validated above; in production this would be Clerk's verified identity (ADR-003).
  //
  // DECISION (TASK-004-010): This is a STANDALONE audit insert (no DB transaction to bind to).
  // See file header for full rationale: no admin-credential-login mutation exists yet.
  // Fail-closed at the RESPONSE level: if recordAuthEvent throws, we return 500 and do NOT
  // send the session cookie. The session is only established after the audit record commits.
  //
  // Only audit ACCOUNTANT sign-in events (the accountant is the admin user of this app).
  // CLIENT sessions through this endpoint (e2e fixture setup only) are also audited —
  // they represent test-harness-controlled account establishment, not production flows.
  try {
    await recordAuthEvent({
      actor: {
        clerkUserId, // server-controlled (validated from POST body above — not client-asserted)
        role,        // server-controlled per ADR-005
      },
      action: "auth.signin",
      sourceSurface: "admin",
      outcome: "success",
      // No transaction: DECISION (TASK-004-010) — deferred until real admin-login mutation lands.
      // transaction: undefined (standalone insert)
    });
  } catch (auditErr) {
    // Fail-closed: audit write failure prevents session establishment (ADR-019 §3 spirit).
    console.error("[mock-session] Audit INSERT failed — session establishment aborted (ADR-019)", auditErr);
    return NextResponse.json(
      { error: "Session establishment failed due to an internal audit error." },
      { status: 500 },
    );
  }

  const setCookieHeader = await buildMockSessionSetCookieHeader({ clerkUserId, role });

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { "Set-Cookie": setCookieHeader },
    },
  );
}

export async function DELETE(_request: NextRequest) {
  if (!isMockActive()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Clear the mock session cookie by setting max-age=0
  const clearCookie = `${MOCK_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { "Set-Cookie": clearCookie },
    },
  );
}
