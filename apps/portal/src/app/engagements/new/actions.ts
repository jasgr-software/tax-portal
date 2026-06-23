/**
 * apps/portal/src/app/engagements/new/actions.ts
 * — Server action for the returning-client new-engagement request flow
 *
 * AC-DOOR-009-01: A signed-in CLIENT can start a new engagement request from
 *   the portal surface. This action is the write path for that flow.
 * AC-DOOR-009-02: The CLIENT selects one or more active services (serviceIds).
 * AC-DOOR-009-03: Contact info is NOT accepted from the caller — it is resolved
 *   from on-file data by createReturningClientRequest (DECISION-E / ADR-003).
 * AC-DOOR-009-04: Submission creates a pending EngagementRequest + Notification
 *   routed to the accountant inbox (like the front-door path — DECISION-A).
 *
 * ADR-003: CLIENT identity resolved server-side from the request cookie.
 *   Contact fields (firstName/lastName/email) come only from on-file data — never
 *   from client-supplied form input. createReturningClientRequest enforces this
 *   at the DB layer (input shape has only clerkUserId + serviceIds).
 * ADR-022: The submission path is rate-limited per (sourceIp, endpoint) BEFORE
 *   identity resolution — mirrors the front-door rate-limit posture (portal:sign-in).
 *   // ADR-022
 * ADR-005: Role is resolved server-side from the verified session. A non-CLIENT
 *   caller (ACCOUNTANT or unauthenticated) is rejected before any write.
 *   // CS-TS-004
 *
 * CS-TS-001: DB write goes through @tax-portal/db (admin pool via createReturningClientRequest).
 *   No raw pool import in this file. // CS-TS-001
 * CS-TS-002: No direct import of requestDb / adminDb or raw mssql pools. // CS-TS-002
 * CS-TS-003: Mirrors the front-door request action (apps/portal/(public)/request/actions.ts)
 *   in structure and coding pattern. // CS-TS-003
 * CS-TS-004: Identity resolved from the request cookie before any write;
 *   role=CLIENT guard enforced before createReturningClientRequest is called. // CS-TS-004
 * CS-GEN-001: No PII (firstName/lastName/email) in server logs. Only error type/name logged.
 *   // CS-GEN-001
 * CS-GEN-003: Governing authority cited in all function-level comments. // CS-GEN-003
 */

"use server";

import { headers } from "next/headers";
import { z } from "zod";
import {
  getAuthProvider,
  getRateLimiter,
  buildRateLimitKey,
} from "@tax-portal/auth";
import {
  createReturningClientRequest,
  UserNotFoundError,
  UserContactNotFoundError,
} from "@tax-portal/db"; // CS-TS-001: admin pool write via @tax-portal/db only

// ─── UUID validation pattern ─────────────────────────────────────────────────

// UUID v4 pattern — service IDs are NEWSEQUENTIALID() UUIDs from SQL Server
// Mirrors front-door actions.ts UUID_PATTERN (CS-TS-003 cross-surface parity)
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Zod schema ───────────────────────────────────────────────────────────────

/**
 * Server-side schema for the returning-client request form.
 *
 * AC-DOOR-009-03: No contact fields (firstName/lastName/email) — on-file resolution
 *   happens inside createReturningClientRequest (DECISION-E / ADR-003).
 * AC-DOOR-009-02: serviceIds must have at least one valid UUID.
 *
 * // CS-TS-003: mirrors front-door EngagementRequestSchema (serviceIds shape, UUID pattern)
 */
const ReturningClientRequestSchema = z.object({
  serviceIds: z
    .array(z.string().regex(UUID_PATTERN, "Invalid service ID"))
    .min(1, "Please select at least one service"),
});

// ─── Result types ─────────────────────────────────────────────────────────────

export interface SubmitReturningClientRequestResult {
  success: boolean;
  requestId?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** When true, the error is a rate-limit rejection (ADR-022). */
  rateLimited?: boolean;
  // MINOR-003 (PR #93 review): noContactOnFile removed — the field was set but never read
  // by any caller. The "no contact on file" condition is already surfaced via the error string
  // and the success: false flag. Callers should check error for the human-readable message.
  // The UserContactNotFoundError catch arm is preserved (it sets the error message); only
  // the unused discriminator field is removed from the return type.
}

// ─── Rate-limit endpoint ──────────────────────────────────────────────────────

/** Stable endpoint identifier for the returning-client request submission (ADR-022). */
const RETURNING_REQUEST_ENDPOINT = "portal:returning-client-request" as const;

// ─── IP resolution ────────────────────────────────────────────────────────────

/**
 * Resolve the source IP server-side from the incoming request headers.
 *
 * Mirrors resolveSourceIp() in sign-in/actions.ts and sign-up/actions.ts.
 * ADR-022 §1: rate-limit key = (sourceIp, endpoint) — client-IP-based, not identity-based.
 * ADR-005 trusted-proxy assumption: X-Forwarded-For trusted only when TRUST_PROXY=true.
 *
 * // ADR-022 // ADR-005 // CS-TS-003
 */
async function resolveSourceIp(): Promise<string> {
  const headerStore = await headers();
  const trustProxy = process.env["TRUST_PROXY"] === "true";

  if (trustProxy) {
    const xForwardedFor = headerStore.get("x-forwarded-for");
    if (xForwardedFor) {
      const firstIp = xForwardedFor.split(",")[0]?.trim();
      if (firstIp) return firstIp;
    }
    const xRealIp = headerStore.get("x-real-ip");
    if (xRealIp) return xRealIp.trim();
  }

  return "127.0.0.1";
}

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the CLIENT identity from the request cookie.
 *
 * CS-TS-004: Identity is resolved from the server-side request cookie.
 *   role MUST be CLIENT; ACCOUNTANT or unauthenticated → null (reject).
 * ADR-005: Role from the verified session ONLY — never from form data or URL params.
 *
 * Mirrors getClientIdentity() in onboarding/actions.ts (CS-TS-003 cross-surface parity).
 *
 * // CS-TS-004 // ADR-005 // CS-TS-003
 */
async function getClientIdentity(): Promise<{
  clerkUserId: string;
  role: "CLIENT";
} | null> {
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  // CS-TS-004: role must be CLIENT — reject ACCOUNTANT and unauthenticated
  if (!identity || identity.role !== "CLIENT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: "CLIENT" };
}

// ─── Server Action ────────────────────────────────────────────────────────────

/**
 * Server Action: submit a returning-client new-engagement request.
 *
 * Flow:
 *   1. Rate-limit check (ADR-022) BEFORE identity or any write.
 *   2. Resolve CLIENT identity from request cookie (CS-TS-004 / ADR-005).
 *      Returns unauthorized if not CLIENT.
 *   3. Validate serviceIds with Zod (defense in depth — client also guards).
 *   4. Delegate to createReturningClientRequest from @tax-portal/db.
 *      Contact is resolved on-file inside the seam (DECISION-E / AC-DOOR-009-03).
 *   5. Return { success: true, requestId } on success.
 *
 * AC-DOOR-009-01/-02/-03/-04 are all satisfied by this path:
 *   01: Only a signed-in CLIENT can reach this action (identity guard).
 *   02: serviceIds are the caller's service selection; at least one required.
 *   03: No contact fields in the input — resolved from on-file data.
 *   04: createReturningClientRequest creates pending request + notification → admin inbox.
 *
 * CS-GEN-001: No PII in logs — only error type/name.
 * CS-TS-001: DB write goes through @tax-portal/db only (createReturningClientRequest).
 * CS-TS-002: No raw pool import.
 * CS-TS-003: Structure mirrors front-door submitEngagementRequest.
 * CS-TS-004: Identity guard at the action layer.
 * ADR-022: Rate-limit BEFORE identity check.
 *
 * // CS-TS-001 // CS-TS-002 // CS-TS-003 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // ADR-003 // ADR-022
 */
export async function submitReturningClientRequest(
  formData: FormData,
): Promise<SubmitReturningClientRequestResult> {
  // ── Step 1: ADR-022 rate-limit BEFORE identity or write ───────────────────
  // Guards against submission-path abuse. Mirrors sign-in/actions.ts pattern.
  // ADR-022: per (sourceIp, endpoint) — not per identity, so a bad actor cannot
  // bypass by rotating auth tokens.
  const sourceIp = await resolveSourceIp();
  const rateLimitKey = buildRateLimitKey(sourceIp, RETURNING_REQUEST_ENDPOINT);
  const limiter = getRateLimiter();
  const rateLimitResult = limiter.consume(rateLimitKey); // ADR-022

  if (!rateLimitResult.allowed) {
    // CS-GEN-001: no PII in this log line
    return {
      success: false,
      error: "Too many submission attempts. Please wait before trying again.",
      rateLimited: true,
    };
  }

  // ── Step 2: CS-TS-004 identity guard — CLIENT only ────────────────────────
  // ADR-005: role from the verified session only.
  // CS-TS-004: resolves identity from the request cookie before any write.
  const identity = await getClientIdentity(); // CS-TS-004

  if (!identity) {
    return {
      success: false,
      error: "Authentication required. Please sign in to submit a request.",
    };
  }

  // ── Step 3: Validate serviceIds (server-side Zod — defense in depth) ──────
  // AC-DOOR-009-02: at least one service must be selected.
  // Mirrors front-door schema validation (CS-TS-003).
  let parsedServiceIds: unknown;
  try {
    const serviceIdsRaw = formData.get("serviceIds");
    parsedServiceIds =
      typeof serviceIdsRaw === "string" ? JSON.parse(serviceIdsRaw) : [];
  } catch {
    return {
      success: false,
      error: "Invalid service selection. Please try again.",
    };
  }

  const parseResult = ReturningClientRequestSchema.safeParse({
    serviceIds: parsedServiceIds,
  });

  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [field, messages] of Object.entries(
      parseResult.error.flatten().fieldErrors,
    )) {
      if (messages && messages.length > 0) {
        fieldErrors[field] = messages;
      }
    }

    const serviceIdErrors = parseResult.error.flatten().fieldErrors["serviceIds"];
    if (serviceIdErrors && serviceIdErrors.length > 0) {
      return {
        success: false,
        error: "Please select at least one service.",
        fieldErrors,
      };
    }

    return {
      success: false,
      error: "Please correct the errors and try again.",
      fieldErrors,
    };
  }

  const { serviceIds } = parseResult.data;

  // ── Step 4: Call createReturningClientRequest (CS-TS-001 admin-pool write) ─
  // AC-DOOR-009-03: contact NOT passed — resolved from on-file data in the seam
  //   (DECISION-E: User → Engagement → EngagementRequest chain).
  // AC-DOOR-009-04: seam creates pending EngagementRequest + Notification → inbox.
  // CS-TS-001: write goes through @tax-portal/db only.
  // CS-TS-002: no raw pool import in this file.
  // CS-GEN-001: only error type/name logged — no PII.
  try {
    const result = await createReturningClientRequest({
      clerkUserId: identity.clerkUserId, // server-resolved — never client-supplied
      serviceIds, // validated list — AC-DOOR-009-02
    }); // CS-TS-001 // CS-TS-002 // ADR-003

    return {
      success: true,
      requestId: result.requestId,
    };
  } catch (err) {
    if (err instanceof UserContactNotFoundError) {
      // DECISION-E: the client has no prior EngagementRequest (no prior engagement).
      // The UI should surface this as a "no contact on file" case.
      // CS-GEN-001: no PII in this log line (only error type + userId fragment)
      console.error(
        "[submitReturningClientRequest] UserContactNotFoundError:",
        err.name,
      );
      return {
        success: false,
        error:
          "We could not find your contact details on file. " +
          "Please contact your accountant to get started.",
        // MINOR-003: noContactOnFile removed from result type (was set but never read)
      };
    }

    if (err instanceof UserNotFoundError) {
      // Should not occur under normal operation — identity guard already confirmed the session.
      // CS-GEN-001: no PII — only error type
      console.error(
        "[submitReturningClientRequest] UserNotFoundError:",
        err.name,
      );
      return {
        success: false,
        error: "Authentication required. Please sign in and try again.",
      };
    }

    // Unexpected error — log type only (CS-GEN-001: no PII in logs)
    const errName = err instanceof Error ? err.name : "UnknownError";
    const errMsg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    console.error(
      "[submitReturningClientRequest] createReturningClientRequest failed:",
      errName,
      errMsg,
    ); // CS-GEN-001: no PII — errName + first line of message only

    return {
      success: false,
      error:
        "We were unable to submit your request. Please try again later. " +
        "If the problem persists, please contact your accountant directly.",
    };
  }
}
