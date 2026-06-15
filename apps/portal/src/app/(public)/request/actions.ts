/**
 * apps/portal/src/app/(public)/request/actions.ts — Server Action for request submission
 *
 * AC-DOOR-004-03: Request persisted in pending state (delegated to createEngagementRequest).
 * AC-DOOR-004-04: No User/account row created (delegated to createEngagementRequest).
 * AC-DOOR-004-05: Zero-selection guard — server-side defense in depth.
 *
 * ADR-003: Uses createEngagementRequest from @tax-portal/db (admin-pool, insert-only).
 *          This is the ONE sanctioned identity-less write in the system.
 *          Do NOT use requestDb here — it fails closed under RLS by design.
 * ADR-020: PII (name, email) — handled per at-rest posture; no exposure of other requests.
 * REQ-DOOR-004: Anonymous submit — no Clerk identity required.
 *
 * Input validation with Zod provides defense in depth against malformed payloads.
 * serviceIds are validated as UUIDs — prevents injection of arbitrary values.
 */

"use server";

import { z } from "zod";
import { createEngagementRequest } from "@tax-portal/db";

// UUID v4 pattern — service IDs are NEWSEQUENTIALID() UUIDs from SQL Server
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Zod schema for the engagement request form
const EngagementRequestSchema = z.object({
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(100, "First name must be 100 characters or fewer")
    .trim(),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(100, "Last name must be 100 characters or fewer")
    .trim(),
  email: z
    .string()
    .min(1, "Email is required")
    .max(254, "Email must be 254 characters or fewer")
    .email("Please enter a valid email address")
    .trim()
    .toLowerCase(),
  // serviceIds is a JSON array of UUID strings — validated per-element
  serviceIds: z
    .array(z.string().regex(UUID_PATTERN, "Invalid service ID"))
    .min(1, "Please select at least one service"),
});

export interface SubmitResult {
  success: boolean;
  requestId?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Server Action: validates input and delegates to the TASK-003 admin-pool insert-only create.
 *
 * Write path: FormData → Zod validation → createEngagementRequest (admin pool) → {id, status}
 *
 * No read-back of other requests — returns only {requestId} of the newly created row.
 * ADR-020: PII inputs are passed through to createEngagementRequest, which stores them
 *          under TDE at-rest posture. No logging of PII fields here.
 */
export async function submitEngagementRequest(
  formData: FormData,
): Promise<SubmitResult> {
  // Parse serviceIds from JSON string (set by RequestForm before action call)
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

  // Validate with Zod — defense in depth (client-side also guards)
  const parseResult = EngagementRequestSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
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

    // Specific message for zero-service selection (AC-DOOR-004-05 server-side)
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

  const { firstName, lastName, email, serviceIds } = parseResult.data;

  // Delegate to the TASK-003 admin-pool insert-only create
  // ADR-003: This is the ONE sanctioned identity-less write.
  // No direct Prisma access — goes through the @tax-portal/db wrapper.
  try {
    const result = await createEngagementRequest({
      firstName,
      lastName,
      email,
      serviceIds,
    });

    return {
      success: true,
      requestId: result.id,
    };
  } catch (err) {
    // Do not expose internal error details to the client (ADR-020 / security posture)
    console.error("[submitEngagementRequest] createEngagementRequest failed:", err);
    return {
      success: false,
      error:
        "We were unable to submit your request. Please try again later. " +
        "If the problem persists, please contact us directly.",
    };
  }
}
