/**
 * apps/admin/src/app/engagements/[engagementId]/document-requests/validation.ts
 *
 * Shared validation constants and helpers for document-request label validation.
 * Imported by both actions.ts (server) and DocumentRequestEditor.tsx (client)
 * so client-side validation mirrors server-side exactly.
 *
 * AC-FILE-007-01: Label is required, non-empty (trimmed), and bounded by the column width.
 *
 * Kept in a separate file (not "use server") so both client and server components can import it.
 * Next.js "use server" files may only export async functions; constants and sync helpers must
 * live in a separate module.
 */

/** Maximum label length (matches the NVARCHAR(500) column constraint). */
export const LABEL_MAX_LENGTH = 500;

/**
 * Validate a document-request label.
 * Returns an error message if invalid, null if valid.
 *
 * Rules:
 *   - Must be a non-empty string.
 *   - Must not be whitespace-only (trimmed must be non-empty).
 *   - Must not exceed LABEL_MAX_LENGTH characters (NVARCHAR(500) column).
 *
 * Used server-side in actions.ts and client-side in DocumentRequestEditor.tsx.
 */
export function validateLabel(label: unknown): string | null {
  if (typeof label !== "string") {
    return "Label must be a string";
  }
  if (!label.trim()) {
    return "Label is required and must not be empty or whitespace-only";
  }
  if (label.trim().length > LABEL_MAX_LENGTH) {
    return `Label must not exceed ${LABEL_MAX_LENGTH} characters`;
  }
  return null;
}
