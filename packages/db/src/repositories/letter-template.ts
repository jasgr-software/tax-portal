/**
 * packages/db/src/repositories/letter-template.ts
 *
 * Data-access functions for LetterTemplate.
 *
 * AC-IDNT-007-01: A system-provided default engagement-letter template exists out-of-box.
 *   → getCurrentLetterTemplate returns the seeded default row.
 * AC-IDNT-007-02: The accountant can edit the template's content.
 *   → updateLetterTemplate persists the edited content.
 * AC-IDNT-007-03: The accountant's edited template is what the client is presented to sign.
 *   → getCurrentLetterTemplate is called when preparing the letter for the client.
 *
 * Pool strategy:
 *   - getCurrentLetterTemplate: ADMIN POOL — the LetterTemplate is not client-readable.
 *     No RLS policy on this table; the admin pool is the correct choice for accountant/system reads.
 *     In the portal context (client-facing), the template is read at letter-presentation time by
 *     server-side code that runs under the accountant's or admin identity, not the client's.
 *   - updateLetterTemplate: ADMIN POOL — accountant-only mutation; no request-pool path.
 *
 * // DECISION-D: Single-current-row pattern — there is always exactly one active template.
 * // The accountant replaces content in place; no versioning in Phase 2.
 * // The system seeds one default row with isSystemDefault = 1 (AC-IDNT-007-01).
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The full LetterTemplate shape.
 *
 * AC-IDNT-007-01: isSystemDefault = true on the seeded row.
 * AC-IDNT-007-02: updatedBy carries the accountant's clerkId on edit.
 */
export interface LetterTemplateItem {
  id: string;
  content: string;
  /** True for the system-seeded default row (AC-IDNT-007-01). */
  isSystemDefault: boolean;
  /** Accountant's clerkId on edit; null for the system-seeded row. */
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for updating the current letter template. */
export interface UpdateLetterTemplateInput {
  /** The Engagement letter template content (AC-IDNT-007-02). */
  content: string;
  /** The accountant's Clerk user ID — recorded for the audit trail (AC-IDNT-007-02). */
  accountantClerkId: string;
}

// ─── Read: getCurrentLetterTemplate (admin pool) ──────────────────────────────

/**
 * Returns the current engagement letter template.
 *
 * DECISION-D: Single-current-row pattern — returns the first row ordered by
 * updatedAt DESC. In practice there should only be one row (seeded default).
 * If no row exists (DB not yet seeded), returns null.
 *
 * Uses admin pool (LetterTemplate is not client-readable; no RLS policy on this table).
 *
 * AC-IDNT-007-01: The seeded row is returned when the accountant hasn't edited yet.
 * AC-IDNT-007-03: Called when preparing the letter for the client to sign.
 */
export async function getCurrentLetterTemplate(): Promise<LetterTemplateItem | null> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  const result = await req.query<{
    id: string;
    content: string;
    isSystemDefault: boolean;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `SELECT TOP 1
       [id], [content], [isSystemDefault], [updatedBy], [createdAt], [updatedAt]
     FROM [dbo].[LetterTemplate]
     ORDER BY [updatedAt] DESC`
  );

  const row = result.recordset[0];
  if (!row) return null;

  return {
    id: row.id,
    content: row.content,
    isSystemDefault: Boolean(row.isSystemDefault),
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Write: updateLetterTemplate (admin pool — accountant-only) ───────────────

/**
 * Updates the current letter template content.
 *
 * DECISION-D: Updates the single existing row in-place (top 1 ordered by updatedAt).
 * Sets isSystemDefault = 0 and records the accountant's clerkId in updatedBy.
 *
 * Returns { rowsAffected: number } — 1 on success, 0 if no row exists.
 *
 * AC-IDNT-007-02: The accountant's edited template replaces the current content.
 */
export async function updateLetterTemplate(
  input: UpdateLetterTemplateInput,
): Promise<{ rowsAffected: number }> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("content", input.content);
  req.input("accountantClerkId", input.accountantClerkId);

  // DECISION-D: Update the single row in place. Uses a subquery to find the TOP 1 id
  // so the UPDATE targets exactly one row.
  const result = await req.query<{ rowsAffected: number }>(
    `UPDATE [dbo].[LetterTemplate]
     SET [content] = @content,
         [isSystemDefault] = 0,
         [updatedBy] = @accountantClerkId,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = (
       SELECT TOP 1 [id] FROM [dbo].[LetterTemplate] ORDER BY [updatedAt] DESC
     );
     SELECT @@ROWCOUNT AS rowsAffected;`
  );

  const rowsAffected =
    (result.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

  return { rowsAffected };
}
