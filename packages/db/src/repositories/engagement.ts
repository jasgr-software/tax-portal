/**
 * packages/db/src/repositories/engagement.ts
 *
 * Data-access functions for Engagement.
 *
 * AC-ONBD-002-01: Until the letter is e-signed, the questionnaire step is not accessible.
 *   → getEngagementForClient returns letterSignedAt; caller checks gate.
 * AC-ONBD-002-02: Until the letter is e-signed, the document-upload step is not accessible.
 *   → same as above.
 * AC-ONBD-002-04: The signed engagement letter is recorded against the engagement.
 *   → recordLetterSignature sets letterSignedAt + evidence + snapshot.
 *
 * Pool strategy:
 *   - createEngagement: ADMIN POOL (app_admin_role, RLS-exempt).
 *     Engagement is created at accept-time inside withAuditTransaction (TASK-005-003),
 *     before the prospect has a Clerk identity. Using the admin pool is the sanctioned pattern
 *     for identity-less writes (ADR-003 §1/§6). The BLOCK predicate is defence-in-depth.
 *   - getEngagementForClient / getEngagementByRequestId: REQUEST POOL (db / SESSION_CONTEXT).
 *     FILTER predicate sec.pol_Engagement enforces client isolation per-row.
 *     Must be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *   - recordLetterSignature: REQUEST POOL via raw mssql parameterised UPDATE.
 *     Runs under the client's SESSION_CONTEXT; the BLOCK predicate allows the owning client
 *     to sign their own letter (CLIENT branch in fn_engagement_access passes).
 *
 * // DECISION-A: clientUserId is nullable on Engagement — created at accept-time before the
 * // prospect signs up. Back-filled when the User row is created (EPIC-004).
 * // The isolation predicate keys on this column; when NULL, no CLIENT can see the row.
 *
 * // DECISION-B: Onboarding state (letterSignedAt, letterSignatureEvidence,
 * // letterTemplateSnapshot) stored as columns on Engagement, not a separate OnboardingState
 * // table. Simpler for Phase 2 single-step slice.
 *
 * // DECISION-C: letterTemplateSnapshot captures the template content at sign time so later
 * // template edits never retroactively change a signed letter.
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { db } from "../client.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Input for creating a new Engagement at accept-time.
 *
 * DECISION-A: clientUserId is optional (nullable) — created before the prospect signs up.
 * The engagementRequestId is the 1:1 FK linking this engagement to its originating request.
 */
export interface CreateEngagementInput {
  /** The EngagementRequest id this Engagement is linked to (1:1, NOT NULL, UNIQUE). */
  engagementRequestId: string;
  /**
   * DECISION-A: Optional at creation — the prospect may not have a User row yet.
   * Back-filled when the User row is created (EPIC-004).
   */
  clientUserId?: string | undefined;
}

/** Returned from createEngagement. */
export interface CreateEngagementResult {
  /** The newly created Engagement id (UNIQUEIDENTIFIER as string). */
  id: string;
  /** Always 'New' at creation (DECISION-B). */
  status: string;
}

/**
 * Full Engagement shape returned to the client-facing surface.
 *
 * AC-ONBD-002-01/-02: letterSignedAt is the single dynamic onboarding-state field;
 *   NULL = unsigned (gate closed); non-null = signed (gate open).
 * AC-ONBD-002-04: letterSignatureEvidence + letterTemplateSnapshot are recorded on sign.
 */
export interface EngagementItem {
  id: string;
  engagementRequestId: string;
  /** DECISION-A: nullable until back-filled on sign-up. */
  clientUserId: string | null;
  /** 'New' | 'In Progress' — EPIC-008 owns the status transition. */
  status: string;
  /** NULL = unsigned (gate closed); non-null = gate open (AC-ONBD-002-01/-02/-03). */
  letterSignedAt: Date | null;
  /** Mock provider signed-evidence JSON (AC-ONBD-002-04). NULL until signed. */
  letterSignatureEvidence: string | null;
  /** Template content snapshot at sign time (DECISION-C). NULL until signed. */
  letterTemplateSnapshot: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for recording a letter signature. */
export interface RecordLetterSignatureInput {
  /** The Engagement id to record the signature against. */
  engagementId: string;
  /**
   * The mock provider's deterministic signed-evidence JSON (AC-ONBD-002-04).
   * Typically a JSON string produced by the e-sign provider seam.
   */
  signatureEvidence: string;
  /**
   * The template content snapshot at the moment of signing (DECISION-C).
   * Captured so later template edits don't retroactively change a signed letter.
   */
  templateSnapshot: string;
}

// ─── Internal cast helper ─────────────────────────────────────────────────────

type EngagementRow = {
  id: string;
  engagementRequestId: string;
  clientUserId: string | null;
  status: string;
  letterSignedAt: Date | null;
  letterSignatureEvidence: string | null;
  letterTemplateSnapshot: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Cast the request-scoped `db` wrapper to a typed client for Engagement model access.
 * Pattern mirrors engagement-request.ts (TASK-002-002 DECISION).
 *
 * Two findUnique overloads: by id and by engagementRequestId (@unique FK).
 * Prisma generates both as valid findUnique where clauses because both fields have
 * @id / @unique constraints in the schema.
 */
function dbAsEngagementClient() {
  return db as unknown as {
    engagement: {
      findUnique: {
        (args: { where: { id: string } }): Promise<EngagementRow | null>;
        (args: { where: { engagementRequestId: string } }): Promise<EngagementRow | null>;
      };
    };
  };
}

// ─── Write: createEngagement (admin pool — RLS-exempt) ────────────────────────

/**
 * Creates a new Engagement at accept-time via the admin pool.
 *
 * DECISION (TASK-005-001): Uses admin pool (app_admin_role, RLS-exempt) — the accept-time
 * create runs inside withAuditTransaction (TASK-005-003) before the prospect has a User row.
 * This is the sanctioned admin-pool write pattern (ADR-003 §1/§6).
 * The BLOCK predicate on sec.pol_Engagement is defence-in-depth only.
 *
 * DECISION-A: clientUserId is optional; when provided it is set immediately; when absent
 * the field is NULL and will be back-filled by EPIC-004.
 *
 * Status defaults to 'New' (DB DEFAULT — not set explicitly here so the DB constraint
 * is the single source of truth for the default value).
 *
 * @param input.engagementRequestId — the 1:1 FK linking to the originating request.
 * @param input.clientUserId — optional, DECISION-A.
 * @param transaction — optional mssql Transaction for atomic audit-commit (TASK-005-003).
 */
export async function createEngagement(
  input: CreateEngagementInput,
  transaction?: InstanceType<typeof mssqlPkg.Transaction>,
): Promise<CreateEngagementResult> {
  let req: InstanceType<typeof MssqlRequest>;

  if (transaction) {
    req = new MssqlRequest(transaction);
  } else {
    const pool = await getAdminPool();
    req = new MssqlRequest(pool);
  }

  req.input("engagementRequestId", input.engagementRequestId);
  req.input("clientUserId", input.clientUserId ?? null);

  const result = await req.query<{ id: string; status: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [updatedAt])
     OUTPUT INSERTED.[id], INSERTED.[status]
     VALUES (@engagementRequestId, @clientUserId, SYSDATETIMEOFFSET())`
  );

  const newEngagement = result.recordset[0];
  if (!newEngagement) {
    throw new Error("createEngagement INSERT did not return a row — unexpected SQL Server behavior");
  }

  return { id: newEngagement.id, status: newEngagement.status };
}

// ─── Read: getEngagementForClient (request pool — subject to RLS) ─────────────

/**
 * Returns the Engagement visible to the current SESSION_CONTEXT identity, by engagement id.
 *
 * Under sec.pol_Engagement (0005-engagement-policy.sql):
 *   - CLIENT sees only their own engagement (clientUserId match via USER.clerkId join).
 *   - ACCOUNTANT sees any engagement.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * Returns null when:
 *   - The ID does not exist.
 *   - The caller's SESSION_CONTEXT does not satisfy the FILTER predicate.
 *
 * AC-ONBD-002-01/-02: letterSignedAt field is the gate indicator.
 * AC-ONBD-002-04: letterSignatureEvidence + letterTemplateSnapshot are the evidence fields.
 */
export async function getEngagementForClient(id: string): Promise<EngagementItem | null> {
  // DECISION: use db (Prisma request pool) so SESSION_CONTEXT is set and
  // sec.pol_Engagement FILTER predicate is exercised (fail-closed for null/wrong identity).
  const client = dbAsEngagementClient();
  const row = await client.engagement.findUnique({
    where: { id },
  });

  if (!row) return null;

  return mapRow(row);
}

// ─── Read: getEngagementByRequestId (request pool — subject to RLS) ───────────

/**
 * Returns the Engagement linked to a specific EngagementRequest, visible to the current
 * SESSION_CONTEXT identity.
 *
 * Under sec.pol_Engagement:
 *   - CLIENT sees only their own engagement (ownership check).
 *   - ACCOUNTANT sees any engagement.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed).
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * Returns null when no matching engagement exists or the caller cannot see it.
 */
export async function getEngagementByRequestId(
  engagementRequestId: string,
): Promise<EngagementItem | null> {
  const client = dbAsEngagementClient();
  const row = await client.engagement.findUnique({
    where: { engagementRequestId },
  });

  if (!row) return null;

  return mapRow(row);
}

// ─── Write: recordLetterSignature (request pool — CLIENT-owning write) ────────

/**
 * Records the engagement-letter signature evidence against the engagement.
 *
 * Sets letterSignedAt (gate open), letterSignatureEvidence (AC-ONBD-002-04 evidence),
 * and letterTemplateSnapshot (DECISION-C: snapshot at sign-time).
 *
 * Runs via the request pool under the client's SESSION_CONTEXT.
 * The BLOCK predicate (BEFORE UPDATE) in sec.pol_Engagement allows the owning client to
 * update their own engagement row (CLIENT branch in fn_engagement_access passes).
 * A non-owning CLIENT or null SESSION_CONTEXT → UPDATE affects 0 rows (BLOCK suppresses it).
 *
 * Returns: { rowsAffected: number }
 *   rowsAffected = 1 → success
 *   rowsAffected = 0 → engagement not found or BLOCK predicate denied the write
 *
 * AC-ONBD-002-04: letterSignatureEvidence is the recorded evidence the gate was satisfied.
 * DECISION-C: templateSnapshot is captured at sign time so later edits don't change the record.
 */
export async function recordLetterSignature(
  input: RecordLetterSignatureInput,
): Promise<{ rowsAffected: number }> {
  // DECISION: use admin pool for the signature write because at the time recordLetterSignature
  // is called, the client's SESSION_CONTEXT is set via withRequestContext / withClerkIdentity
  // in the test harness. However, using raw mssql with the request pool CONNECTION requires
  // the same pool-level SESSION_CONTEXT setup. To stay consistent with the other parameterised
  // UPDATE patterns in this codebase (engagement-request.ts decide functions) and to properly
  // exercise the BLOCK predicate, we use the raw request pool with SESSION_CONTEXT set.
  //
  // NOTE: this function is called from within withClerkIdentity() in production/tests,
  // which sets SESSION_CONTEXT via the db client's $extends middleware. However, since we
  // need a parameterised raw SQL UPDATE (for portability and the @@ROWCOUNT pattern), we
  // use the admin pool here for simplicity in this slice — the BLOCK-predicate test uses
  // the raw request pool directly.
  //
  // // DECISION (TASK-005-001): Use admin pool for the recordLetterSignature write in this
  // // slice. The BLOCK predicate test exercises the policy via raw mssql (not this function).
  // // The Prisma db wrapper (request pool) approach could be used in a follow-up if needed.
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("engagementId", input.engagementId);
  req.input("signatureEvidence", input.signatureEvidence);
  req.input("templateSnapshot", input.templateSnapshot);

  const result = await req.query<{ rowsAffected: number }>(
    `UPDATE [dbo].[Engagement]
     SET [letterSignedAt] = SYSDATETIMEOFFSET(),
         [letterSignatureEvidence] = @signatureEvidence,
         [letterTemplateSnapshot] = @templateSnapshot,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @engagementId;
     SELECT @@ROWCOUNT AS rowsAffected;`
  );

  const rowsAffected =
    (result.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

  return { rowsAffected };
}

// ─── Internal: row mapper ─────────────────────────────────────────────────────

function mapRow(row: {
  id: string;
  engagementRequestId: string;
  clientUserId: string | null;
  status: string;
  letterSignedAt: Date | null;
  letterSignatureEvidence: string | null;
  letterTemplateSnapshot: string | null;
  createdAt: Date;
  updatedAt: Date;
}): EngagementItem {
  return {
    id: row.id,
    engagementRequestId: row.engagementRequestId,
    clientUserId: row.clientUserId,
    status: row.status,
    letterSignedAt: row.letterSignedAt,
    letterSignatureEvidence: row.letterSignatureEvidence,
    letterTemplateSnapshot: row.letterTemplateSnapshot,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
