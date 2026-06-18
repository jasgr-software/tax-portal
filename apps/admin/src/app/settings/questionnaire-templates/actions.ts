/**
 * apps/admin/src/app/settings/questionnaire-templates/actions.ts
 *
 * Server actions for the questionnaire-template management page.
 *
 * AC-DASH-012-01: upsertQuestionnaireTemplateAction — accountant creates a new template
 *   for a service type; upsert semantics ensure one-per-service-type invariant.
 * AC-DASH-012-02: Template is bound to the selected serviceId; passed through to the repository.
 * AC-DASH-012-03: upsertQuestionnaireTemplateAction — accountant edits an existing template;
 *   edited content is retained and a re-read returns it.
 * AC-ONBD-003-02: Each service type has its own keyed template; no cross-contamination.
 *
 * ADR-006: Template management is apps/admin ONLY. There is NO mirror action or export in apps/portal.
 * ADR-005: accountantClerkId comes ONLY from the verified session (getAccountantIdentity()) —
 *   NEVER from any action argument or form data.
 *
 * BINDING CONTRACT (TASK-006-001):
 *   getTemplateForService(serviceId)  — admin pool read; returns QuestionnaireTemplateItem | null
 *   upsertTemplateForService(input)   — admin pool write; returns { rowsAffected, action }
 *   listAllServices()                 — request-pool read; returns ServiceItem[] (MUST be inside withRequestContext)
 *   getTemplateForService + upsertTemplateForService run on the admin pool by design
 *   (QuestionnaireTemplate has no RLS FILTER — admin pool is the correct path per DECISION-G).
 *   listAllServices uses the SESSION_CONTEXT-aware `db` wrapper — wrap in withRequestContext.
 *   The DB BLOCK predicate (TASK-006-001) is defence-in-depth, not the primary guard.
 *
 * // DECISION (TASK-006-002): mirrors letter-template/actions.ts exactly for the identity helper,
 * // result-type shape, and admin-pool repository-call pattern. The only structural difference is
 * // a service-type selector and multi-question editor vs. a single textarea.
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthProvider } from "@tax-portal/auth";
import {
  withRequestContext,
  getTemplateForService,
  upsertTemplateForService,
  listAllServices,
} from "@tax-portal/db";
import type { QuestionnaireTemplateItem, QuestionDef } from "@tax-portal/db";

// ─── Result types ─────────────────────────────────────────────────────────────

export type ServiceListResult =
  | { success: true; data: Array<{ id: string; name: string; description: string | null; sortOrder: number }> }
  | { success: false; error: string };

export type QuestionnaireTemplateResult =
  | { success: true; data: QuestionnaireTemplateItem | null }
  | { success: false; error: string };

export type UpsertQuestionnaireTemplateResult =
  | { success: true; action: "created" | "updated" }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified accountant identity from the incoming request headers.
 *
 * Mirrors apps/admin/src/app/settings/letter-template/actions.ts getAccountantIdentity() exactly.
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

// ─── Input validation ─────────────────────────────────────────────────────────

/**
 * Validate a single QuestionDef object.
 * Returns an error message if invalid, null if valid.
 *
 * Question content safety (SDET focus): validates structure but not content —
 * prompts are accountant-authored free text; XSS safety is handled at render time
 * by React's auto-escaping (no dangerouslySetInnerHTML in the editor component).
 *
 * Question `id` values are validated as non-empty strings but not regenerated here —
 * the editor generates stable server-side IDs before calling the action.
 */
function validateQuestionDef(q: unknown, idx: number): string | null {
  if (!q || typeof q !== "object") {
    return `Question at index ${idx} is not a valid object`;
  }

  const question = q as Record<string, unknown>;

  if (typeof question.id !== "string" || !question.id.trim()) {
    return `Question at index ${idx} is missing a valid id`;
  }
  if (typeof question.prompt !== "string" || !question.prompt.trim()) {
    return `Question at index ${idx} is missing a valid prompt`;
  }
  if (question.type !== "text" && question.type !== "textarea") {
    return `Question at index ${idx} has an invalid type: must be 'text' or 'textarea'`;
  }
  if (typeof question.required !== "boolean") {
    return `Question at index ${idx} is missing a boolean 'required' field`;
  }

  return null;
}

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * List all catalog services for the template-picker.
 *
 * Reuses listAllServices from @tax-portal/db (already barrel-exported).
 * ACCOUNTANT-only; listAllServices uses the request-scoped `db` wrapper
 * (SESSION_CONTEXT-aware) so it MUST be called inside withRequestContext.
 *
 * // DECISION (TASK-006-006 bugfix): The TASK-006-002 action comment incorrectly stated
 * // "no withRequestContext needed — admin-pool path per DECISION-G". That note applied
 * // to getTemplateForService + upsertTemplateForService (which use getAdminPool()). But
 * // listAllServices() uses the request-scoped `db` Prisma wrapper and explicitly documents
 * // "MUST be called inside withRequestContext" (service.ts line 152). Without the wrapper
 * // the ADR-003 middleware throws "No identity in request context for Service.findMany".
 *
 * @returns ServiceListResult — success + service list, or failure + error string
 */
export async function listServicesForTemplatesAction(): Promise<ServiceListResult> {
  // ── Identity guard (ACCOUNTANT-only, ADR-005) ─────────────────────────────
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // listAllServices uses the request-scoped `db` wrapper (SESSION_CONTEXT-aware).
  // Wrap in withRequestContext so SESSION_CONTEXT is set before the Prisma query executes.
  const data = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => listAllServices(),
  );
  return { success: true, data };
}

/**
 * Read the current questionnaire template for a service type.
 *
 * AC-DASH-012-02: Returns the template bound to the specified serviceId, or null if none exists.
 *   Absent template is an acceptable starting state (the editor renders empty).
 *
 * Uses the admin pool (via getTemplateForService — no withRequestContext needed;
 * QuestionnaireTemplate has no RLS FILTER policy, admin pool is the correct path per DECISION-G).
 *
 * @param serviceId - The Service.id to load the template for.
 * @returns QuestionnaireTemplateResult — success + template|null, or failure + error string
 */
export async function getQuestionnaireTemplateAction(
  serviceId: string,
): Promise<QuestionnaireTemplateResult> {
  // ── Identity guard (ACCOUNTANT-only, ADR-005) ─────────────────────────────
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  const data = await getTemplateForService(serviceId);
  return { success: true, data };
}

/**
 * Create or update the questionnaire template for a service type.
 *
 * AC-DASH-012-01: Creates a template (first write for this serviceId).
 * AC-DASH-012-02: Binds the template to the serviceId (passed through to the repository).
 * AC-DASH-012-03: Updates the existing template (subsequent write for this serviceId).
 * AC-ONBD-003-02: Keyed by serviceId — each service type gets its own template.
 *
 * Flow:
 *   1. Verify ACCOUNTANT identity from the verified session.
 *   2. Validate serviceId (non-empty string).
 *   3. Validate questions (non-empty array of well-formed QuestionDef).
 *   4. Serialize questions to JSON and call upsertTemplateForService on the admin pool.
 *   5. revalidatePath('/settings/questionnaire-templates') for fresh page render.
 *
 * // DECISION (TASK-006-002): Question ids are generated by the editor component using
 * // crypto.randomUUID() — the action validates them but does not regenerate them.
 * // This keeps the component's UX stable (ids persist across edits) while still
 * // enforcing the structure at the action boundary.
 *
 * @param serviceId - The Service.id to bind the template to.
 * @param questions - Array of QuestionDef objects (validated here; serialized to JSON for the repo).
 * @returns UpsertQuestionnaireTemplateResult — success + action, or failure + error string.
 */
export async function upsertQuestionnaireTemplateAction(
  serviceId: string,
  questions: QuestionDef[],
): Promise<UpsertQuestionnaireTemplateResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-005) ─────────────────────────
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Validate serviceId ─────────────────────────────────────────────────
  if (typeof serviceId !== "string" || !serviceId.trim()) {
    return { success: false, error: "A valid service type must be selected" };
  }

  // ── 3. Validate questions array ───────────────────────────────────────────
  if (!Array.isArray(questions) || questions.length === 0) {
    return { success: false, error: "At least one question is required" };
  }

  for (let i = 0; i < questions.length; i++) {
    const err = validateQuestionDef(questions[i], i);
    if (err) {
      return { success: false, error: `Invalid question: ${err}` };
    }
  }

  // ── 4. Admin-pool write — admin pool is the correct path per DECISION-G ──
  // accountantClerkId from the verified session — NEVER from action args (ADR-005)
  const result = await upsertTemplateForService({
    serviceId: serviceId.trim(),
    questions: JSON.stringify(questions),
    accountantClerkId: identity.clerkUserId,
  });

  // ── 5. Revalidate setting page ────────────────────────────────────────────
  revalidatePath("/settings/questionnaire-templates");

  return { success: true, action: result.action };
}
