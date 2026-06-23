/**
 * apps/admin/src/app/engagements/[engagementId]/attributes/actions.ts
 *
 * Server actions for the engagement attribute management surface.
 *
 * TASK-011-003: Admin attribute server actions + UI panel (due date / note / priority flag).
 *
 * Acceptance criteria:
 *   AC-LIFE-007-01: accountant sets a due date on an engagement
 *   AC-LIFE-007-02: accountant updates an engagement's due date after it has been set
 *   AC-LIFE-008-01: accountant records internal notes on an engagement
 *   AC-LIFE-009-01: accountant flags/marks an engagement as prioritized
 *   AC-LIFE-009-02: accountant removes the flag/priority marker from an engagement
 *
 * Pattern: mirrors [engagementId]/actions.ts (EPIC-010 lifecycle actions) VERBATIM.
 *   - getAccountantIdentity() guard before every write (ADR-003)
 *   - actor built ONLY from the verified session (ADR-019)
 *   - seam calls via @tax-portal/db barrel (CS-TS-001 / CS-TS-002)
 *   - revalidatePath after successful writes
 *
 * // ADR-003: server-side authority — getAccountantIdentity() before every DB write
 * // ADR-006: admin surface ONLY (apps/admin) — nothing in apps/portal (CS-TS-003)
 * // ADR-019: audit actor comes from verified session ONLY — never from action args
 * // CS-TS-001: all DB writes go through @tax-portal/db barrel (no raw pool imports)
 * // CS-TS-002: no direct adminDb/pool import — seam calls via @tax-portal/db barrel
 * // CS-TS-003: these actions exist ONLY in apps/admin — no mirror in apps/portal
 * // CS-TS-004: server-action accountant-identity guard on every attribute write
 * // CS-GEN-001: no note bodies or client PII logged — only engagement IDs in audit rows
 * // CS-GEN-003: cite governing authority in comments
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthProvider } from "@tax-portal/auth";
import {
  setEngagementDueDate,
  setEngagementPriority,
  recordEngagementNote,
} from "@tax-portal/db";
// CS-TS-001: CS-TS-002: all imports from @tax-portal/db barrel (no raw pool imports)
import type { AuditActor } from "@tax-portal/db";

// ─── Result type ──────────────────────────────────────────────────────────────

export type AttributeActionResult =
  | { success: true }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified accountant identity from the incoming request headers.
 *
 * Mirrors apps/admin/src/app/engagements/[engagementId]/actions.ts VERBATIM.
 * Returns null if no identity is found or the role is not ACCOUNTANT.
 *
 * ADR-003: identity.role comes from the verified session (Clerk public metadata
 *   or mock session cookie) — NEVER from any server action argument or form data.
 *   The trust fence is this guard; the DB-layer policy is defence-in-depth only.
 * ADR-006: Apps/admin only — this helper is not exported or available in apps/portal.
 * CS-TS-004: server-action accountant-identity guard — every attribute write calls this.
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT" | "CLIENT";
} | null> {
  // ADR-003: Read identity from the incoming request headers (verified server-side).
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "ACCOUNTANT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: identity.role };
}

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * Set or update the due date on an engagement.
 *
 * AC-LIFE-007-01: accountant can set a due date.
 * AC-LIFE-007-02: accountant can update a due date that has already been set.
 *
 * Both first-set and update go through the same seam (setEngagementDueDate).
 * Pass dueDateStr=null / empty string to clear the due date.
 *
 * ADR-003: identity guard before any DB write.
 * ADR-019: actor = verified session identity (clerkUserId + ACCOUNTANT role).
 * ADR-006: admin surface only.
 * CS-GEN-001: no PII logged.
 *
 * @param engagementId — the Engagement.id (server-resolved from route param).
 * @param dueDateStr   — ISO date string ("YYYY-MM-DD") or null/empty to clear.
 */
export async function setDueDateAction(
  engagementId: string,
  dueDateStr: string | null,
): Promise<AttributeActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003) ──────────────────────────
  const identity = await getAccountantIdentity(); // ADR-003, CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Validate inputs ────────────────────────────────────────────────────
  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // Parse the date string — null/empty means "clear the due date"
  // Strict format guard: reject ISO datetimes ("2026-06-22T00:00:00Z"), bare years ("2026"),
  // or any other input that new Date() silently coerces to a valid date.
  // Review finding: security/A05 — strict ^\d{4}-\d{2}-\d{2}$ before new Date(...).
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  let dueDate: Date | null = null;
  if (dueDateStr && dueDateStr.trim()) {
    const trimmed = dueDateStr.trim();
    if (!DATE_RE.test(trimmed)) {
      return { success: false, error: "Invalid date format — expected YYYY-MM-DD" };
    }
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) {
      return { success: false, error: "Invalid date format — expected YYYY-MM-DD" };
    }
    dueDate = parsed;
  }

  // ── 3. Build actor from verified session (ADR-019) ─────────────────────────
  // Actor for the audit event comes ONLY from the verified session — NEVER from args.
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019
    role: identity.role,               // ADR-019
  };

  // ── 4. Call the TASK-011-002 seam (no duplicate logic here) ───────────────
  // CS-TS-002: setEngagementDueDate imported from @tax-portal/db barrel (no raw pool)
  const result = await setEngagementDueDate({
    engagementId: engagementId.trim(),
    dueDate,
    actor,
    sourceSurface: "admin", // ADR-006: always "admin" from this surface
  });

  if (!result.success) {
    return {
      success: false,
      error: "Could not set due date — engagement not found",
    };
  }

  // ── 5. Revalidate the engagement page ─────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}`);

  return { success: true };
}

/**
 * Record an internal note on an engagement.
 *
 * AC-LIFE-008-01: accountant can record internal notes on an engagement.
 *
 * Notes are accountant-only — sec.pol_EngagementNote enforces that a CLIENT
 * principal reads ZERO notes through any path (ADR-005). The note body is
 * NEVER written to the audit row (CS-GEN-001).
 *
 * ADR-003: identity guard before any DB write.
 * ADR-019: actor = verified session identity.
 * ADR-006: admin surface only — notes NEVER appear in apps/portal (CS-TS-003).
 * CS-GEN-001: note body NEVER logged / audited — only engagementId in audit row.
 *
 * @param engagementId — the Engagement.id (server-resolved from route param).
 * @param body         — the note text (non-empty, not logged in audit rows).
 */
export async function recordNoteAction(
  engagementId: string,
  body: string,
): Promise<AttributeActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003) ──────────────────────────
  const identity = await getAccountantIdentity(); // ADR-003, CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Validate inputs ────────────────────────────────────────────────────
  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (typeof body !== "string" || !body.trim()) {
    return { success: false, error: "Note body is required and must not be empty" };
  }

  // ── 3. Build actor from verified session (ADR-019) ─────────────────────────
  // Actor for the audit event comes ONLY from the verified session.
  // CS-GEN-001: the note body is NEVER written to the audit row — only the actor and engagementId.
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019
    role: identity.role,               // ADR-019
  };

  // ── 4. Call the TASK-011-002 seam (no duplicate logic here) ───────────────
  // CS-TS-002: recordEngagementNote imported from @tax-portal/db barrel (no raw pool)
  // CS-GEN-001: body is passed to the seam for storage ONLY — it is NOT included in the audit row.
  const result = await recordEngagementNote({
    engagementId: engagementId.trim(),
    body: body.trim(),
    createdBy: identity.clerkUserId,   // accountant's clerkId at creation time
    actor,
    sourceSurface: "admin", // ADR-006: always "admin" from this surface
  });

  if (!result.success) {
    return {
      success: false,
      error: "Could not record note — engagement not found",
    };
  }

  // ── 5. Revalidate the engagement page ─────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}`);

  return { success: true };
}

/**
 * Set or clear the priority flag on an engagement.
 *
 * AC-LIFE-009-01: accountant flags/marks an engagement as prioritized (isPriority=true).
 * AC-LIFE-009-02: accountant removes the flag/priority marker (isPriority=false).
 *
 * Both flag and unflag go through the same seam (setEngagementPriority).
 *
 * ADR-003: identity guard before any DB write.
 * ADR-019: actor = verified session identity.
 * ADR-006: admin surface only.
 *
 * @param engagementId — the Engagement.id (server-resolved from route param).
 * @param isPriority   — true = flag as priority; false = unflag.
 */
export async function setPriorityAction(
  engagementId: string,
  isPriority: boolean,
): Promise<AttributeActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003) ──────────────────────────
  const identity = await getAccountantIdentity(); // ADR-003, CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Validate inputs ────────────────────────────────────────────────────
  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (typeof isPriority !== "boolean") {
    return { success: false, error: "isPriority must be a boolean" };
  }

  // ── 3. Build actor from verified session (ADR-019) ─────────────────────────
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019
    role: identity.role,               // ADR-019
  };

  // ── 4. Call the TASK-011-002 seam (no duplicate logic here) ───────────────
  // CS-TS-002: setEngagementPriority imported from @tax-portal/db barrel (no raw pool)
  const result = await setEngagementPriority({
    engagementId: engagementId.trim(),
    isPriority,
    actor,
    sourceSurface: "admin", // ADR-006: always "admin" from this surface
  });

  if (!result.success) {
    return {
      success: false,
      error: "Could not update priority flag — engagement not found",
    };
  }

  // ── 5. Revalidate the engagement page ─────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}`);

  return { success: true };
}
