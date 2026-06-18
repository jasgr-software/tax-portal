/**
 * apps/admin/src/app/settings/letter-template/actions.ts
 *
 * Server actions for the engagement-letter template setting page.
 *
 * AC-IDNT-007-01: getLetterTemplateAction — returns the seeded system default on first open;
 *   null only on a completely unseeded DB (treat defensively).
 * AC-IDNT-007-02: updateLetterTemplateAction — accountant edits the template content;
 *   the edit persists and a re-read returns the edited content.
 *
 * ADR-006: Template editing is an apps/admin setting — NOT reachable from apps/portal.
 *   There is NO mirror action or export in apps/portal.
 *
 * BINDING CONTRACT (TASK-005-001):
 *   getCurrentLetterTemplate()   — admin pool read; returns LetterTemplateItem | null
 *   updateLetterTemplate(input)  — admin pool write; returns { rowsAffected: number }
 *   BOTH run on the admin pool by design (LetterTemplate is accountant-owned, no RLS policy).
 *   Do NOT wrap in withRequestContext — the admin-pool path is correct and SDET-approved.
 *
 * ADR-005: The accountantClerkId recorded on edit comes ONLY from the verified session
 *   (getAccountantIdentity()) — NEVER from any action argument or form data.
 *
 * // DECISION (TASK-005-004): updateLetterTemplate runs on the admin pool (not withRequestContext)
 * // because LetterTemplate has no RLS policy and is accountant-owned (DECISION-D in the repo).
 * // Authorization is enforced here in the action layer by the ACCOUNTANT-only identity guard.
 * // This matches the pool strategy declared in the repository module.
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthProvider } from "@tax-portal/auth";
import { getCurrentLetterTemplate, updateLetterTemplate } from "@tax-portal/db";
import type { LetterTemplateItem } from "@tax-portal/db";

// ─── Result types ─────────────────────────────────────────────────────────────

export type LetterTemplateResult =
  | { success: true; data: LetterTemplateItem | null }
  | { success: false; error: string };

export type UpdateLetterTemplateResult =
  | { success: true }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified accountant identity from the incoming request headers.
 *
 * Mirrors apps/admin/src/app/requests/actions.ts (L122-141) exactly.
 * Returns null if no identity is found or the role is not ACCOUNTANT.
 *
 * ADR-005: identity.role comes from the verified session (Clerk public metadata
 * or mock session cookie) — NEVER from any server action argument or form data.
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT" | "CLIENT";
} | null> {
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
 * Read the current engagement letter template.
 *
 * AC-IDNT-007-01: Returns the seeded system default on first open (isSystemDefault=true).
 *   Returns null only when the DB is completely unseeded — handle defensively in the UI.
 *
 * Uses the admin pool (via getCurrentLetterTemplate — no withRequestContext needed;
 * LetterTemplate has no RLS policy, admin pool is the correct path per DECISION-D).
 *
 * ACCOUNTANT-only read: while the admin pool technically bypasses RLS, we still guard
 * with getAccountantIdentity() here as defense-in-depth. ADR-010 guarantees ACCOUNTANT
 * middleware is present, but this module adds an extra layer.
 *
 * @returns LetterTemplateResult — success + LetterTemplateItem|null, or failure + error
 */
export async function getLetterTemplateAction(): Promise<LetterTemplateResult> {
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  const data = await getCurrentLetterTemplate();
  return { success: true, data };
}

/**
 * Update the current engagement letter template content.
 *
 * AC-IDNT-007-02: Persists the accountant's edited content; a re-read returns the new content.
 *   The accountant's clerkId is recorded in updatedBy (part of the AC-IDNT-007-02 audit trail).
 *
 * Flow:
 *   1. Verify ACCOUNTANT identity from the verified session.
 *   2. Validate content (non-empty string required).
 *   3. Call updateLetterTemplate({ content, accountantClerkId }) on the admin pool.
 *      rowsAffected === 0 → no row to update (unseeded DB) → failure result.
 *      rowsAffected === 1 → success.
 *   4. revalidatePath('/settings/letter-template') so the page re-renders with fresh data.
 *
 * // DECISION (TASK-005-004): updateLetterTemplate runs directly on the admin pool
 * // (not wrapped in withRequestContext). See module-level DECISION comment.
 * // The accountantClerkId comes from the verified identity — never from form data.
 *
 * @param content - The new template content (plain text / markdown).
 * @returns UpdateLetterTemplateResult — success, or failure + error string.
 */
export async function updateLetterTemplateAction(
  content: string,
): Promise<UpdateLetterTemplateResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-005) ─────────────────────────
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ──────────────────────────────────────────────────
  if (typeof content !== "string" || !content.trim()) {
    return { success: false, error: "Template content is required and must be non-empty" };
  }

  // ── 3. Admin-pool write — admin pool is the correct path per DECISION-D ──
  const result = await updateLetterTemplate({
    content: content.trim(),
    accountantClerkId: identity.clerkUserId,
  });

  if (result.rowsAffected === 0) {
    // No row to update — DB not seeded. Surface as a recoverable failure.
    return {
      success: false,
      error: "No template row found to update — the database may not be seeded.",
    };
  }

  // ── 4. Revalidate setting page ────────────────────────────────────────────
  revalidatePath("/settings/letter-template");

  return { success: true };
}
