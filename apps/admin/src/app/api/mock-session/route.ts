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
 * Request body: { clerkUserId: string, role: "ACCOUNTANT" | "CLIENT" }
 * Response: 200 with Set-Cookie header setting __mock_session, body: { ok: true }
 *           404 if AUTH_PROVIDER !== "mock"
 *           400 if body is invalid
 *
 * Also supports DELETE to clear the mock session cookie.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  buildMockSessionSetCookieHeader,
  MOCK_SESSION_COOKIE_NAME,
} from "@tax-portal/auth";

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
