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
 *   - getEngagementForClient: REQUEST POOL (db / SESSION_CONTEXT).
 *     FILTER predicate sec.pol_Engagement enforces client isolation per-row.
 *     Must be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *   - recordLetterSignature: ADMIN POOL (substrate tests only — bypasses BLOCK).
 *     Not exported from the package barrel; import directly from this module in tests.
 *   - recordLetterSignatureAsClient: REQUEST POOL via raw mssql parameterised UPDATE.
 *     Runs under the client's SESSION_CONTEXT; the BLOCK predicate allows the owning client
 *     to sign their own letter (CLIENT branch in fn_engagement_access passes).
 *
 * // DECISION-A (deferred): Engagement.clientUserId is intentionally created NULL under the
 * // mock auth binding (the mock invitation cannot resolve an engagementRequestId from a ticket,
 * // so no back-fill runs at sign-up). RLS fails closed on NULL — no CLIENT principal can read
 * // a NULL-linked engagement row (sec.pol_Engagement FILTER predicate). The back-fill that
 * // resolves Engagement.clientUserId at client sign-up will be (re)introduced with the real
 * // auth-binding enablement slice that makes the ticket→request→engagement linkage reachable.
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
import { parseSqlServerUrl } from "../sql-server-url.js";
import { db } from "../client.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Input for creating a new Engagement at accept-time.
 *
 * DECISION-A (deferred): clientUserId is optional (nullable) — created before the prospect
 * signs up. The back-fill that sets this field will be introduced with the real auth-binding
 * slice that makes the ticket→request→engagement linkage reachable.
 */
export interface CreateEngagementInput {
  /** The EngagementRequest id this Engagement is linked to (1:1, NOT NULL, UNIQUE). */
  engagementRequestId: string;
  /**
   * DECISION-A (deferred): Optional at creation — the prospect may not have a User row yet.
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
  /** DECISION-A (deferred): nullable until back-filled on sign-up. */
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
 * Two findUnique overloads: by id.
 * Also exposes findFirst (no-arg) for the getMyEngagement resolver.
 */
function dbAsEngagementClient() {
  return db as unknown as {
    engagement: {
      findUnique: (args: { where: { id: string } }) => Promise<EngagementRow | null>;
      findFirst: (args?: { orderBy?: { createdAt: "asc" | "desc" } }) => Promise<EngagementRow | null>;
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
 * DECISION-A (deferred): clientUserId is optional; when provided it is set immediately;
 * when absent the field is NULL (RLS fails closed on NULL — see DECISION-A comment above).
 * The back-fill will be introduced with the real auth-binding enablement slice.
 *
 * Status defaults to 'New' (DB DEFAULT — not set explicitly here so the DB constraint
 * is the single source of truth for the default value).
 *
 * @param input.engagementRequestId — the 1:1 FK linking to the originating request.
 * @param input.clientUserId — optional, DECISION-A (deferred).
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

// ─── Read: getMyEngagement (request pool — no-arg, FILTER-governed) ──────────

/**
 * Returns the Engagement visible to the current SESSION_CONTEXT identity, with no
 * caller-supplied id. In Phase 2 a CLIENT owns exactly one engagement.
 *
 * // DECISION (TASK-005-006): The client's engagement is resolved server-side under the
 * // sec.pol_Engagement FILTER predicate — never from a client-supplied URL param, form
 * // data, or body. The FILTER already scopes the query to the caller's own row(s);
 * // findFirst returns that single row. In Phase 2 the brief's out-of-scope fence
 * // (single primary participant per engagement) means at most one row is visible.
 * // If the CLIENT has no engagement yet (clientUserId not yet back-filled — DECISION-A)
 * // the FILTER returns ZERO rows → null (fail-closed). A non-owner or null
 * // SESSION_CONTEXT also returns null (fail-closed, ADR-003 §5).
 * //
 * // This function is the minimal additive read needed by the onboarding page (TASK-005-006)
 * // so the page never receives an id from the client. It mirrors the established FILTER
 * // pattern already used by getEngagementForClient.
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * Returns null when:
 *   - The CLIENT has no engagement (clientUserId not yet set — DECISION-A).
 *   - The caller's SESSION_CONTEXT does not satisfy the FILTER predicate.
 */
export async function getMyEngagement(): Promise<EngagementItem | null> {
  const client = dbAsEngagementClient();
  // findFirst under the FILTER-governed request pool: returns the caller's own row.
  // Phase 2: at most one Engagement is visible (one-per-client).
  const row = await client.engagement.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!row) return null;

  return mapRow(row);
}

// ─── Write: recordLetterSignature (admin pool — substrate/test path only) ────
//
// NOT exported from the package barrel (packages/db/src/index.ts).
// Import directly from this source module in substrate tests that need it:
//   import { recordLetterSignature } from "@tax-portal/db/src/repositories/engagement.js"
// For the production signing path use recordLetterSignatureAsClient (request pool, BLOCK-governed).

/**
 * Records the engagement-letter signature evidence against the engagement.
 *
 * Sets letterSignedAt (gate open), letterSignatureEvidence (AC-ONBD-002-04 evidence),
 * and letterTemplateSnapshot (DECISION-C: snapshot at sign-time).
 *
 * DECISION (TASK-005-001): This function uses the ADMIN POOL — it was introduced in
 * TASK-005-001 as a substrate-level write (bypasses the BLOCK predicate). It is retained
 * for substrate persistence tests (engagement.persistence.test.ts) that need to write
 * signature data directly without exercising the CLIENT ownership gate.
 *
 * For the production signing path that MUST exercise the BLOCK predicate (AC-ONBD-002-01/-02
 * server-side gate), use `recordLetterSignatureAsClient` below (request pool, SESSION_CONTEXT
 * in-batch, BLOCK-governed). That is the function called by signEngagementLetterAction in
 * apps/portal/src/app/onboarding/actions.ts.
 *
 * Returns: { rowsAffected: number }
 *   rowsAffected = 1 → success
 *   rowsAffected = 0 → engagement not found
 */
export async function recordLetterSignature(
  input: RecordLetterSignatureInput,
): Promise<{ rowsAffected: number }> {
  // DECISION (TASK-005-001/TASK-005-005): Admin pool — used for substrate tests only.
  // The production signing path uses recordLetterSignatureAsClient (request pool + BLOCK).
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

// ─── Write: recordLetterSignatureAsClient (request pool — BLOCK-governed) ────

/**
 * Records the engagement-letter signature as the owning CLIENT via the REQUEST POOL.
 *
 * This is the PRODUCTION signing path called by signEngagementLetterAction. Unlike
 * `recordLetterSignature` (admin pool, above), this function:
 *   - Acquires a raw mssql connection from the REQUEST POOL (DATABASE_URL).
 *   - Sets SESSION_CONTEXT (clerk_user_id + role) IN THE SAME BATCH as the UPDATE,
 *     so the sec.pol_Engagement BLOCK predicate (BEFORE UPDATE) governs the write.
 *   - Returns rowsAffected = 0 when the BLOCK predicate denies the write
 *     (non-owner CLIENT or null SESSION_CONTEXT) — the caller must treat 0 as a
 *     refusal and STOP (do not audit a non-event).
 *
 * Pool hygiene: SESSION_CONTEXT keys are cleared after the UPDATE so the pooled
 * connection is returned in a clean state (ADR-003 §4 spirit).
 *
 * DECISION (TASK-005-005): Separate request-pool variant (not a rewrite of
 * `recordLetterSignature`) so substrate persistence tests remain unaffected.
 * The two-function approach is documented here and in the actions.ts DECISION comment.
 *
 * @param input.engagementId — the Engagement to sign.
 * @param input.signatureEvidence — provider evidence JSON (AC-ONBD-002-04).
 * @param input.templateSnapshot — template content at sign time (DECISION-C).
 * @param input.clerkUserId — the CLIENT's Clerk user ID (from verified session only).
 * @param input.role — must be 'CLIENT' (verified server-side, never client-asserted).
 *
 * Returns { rowsAffected: number }:
 *   1 → success (CLIENT is the owner, BLOCK passed, fields set)
 *   0 → denied (non-owner CLIENT, null SESSION_CONTEXT, or engagement not found)
 *
 * AC-ONBD-002-04: letterSignatureEvidence is the recorded evidence.
 * DECISION-C: templateSnapshot captured at sign time.
 * ADR-003 Amendment 1: no @read_only on sp_set_session_context.
 * ADR-005: BLOCK predicate sec.pol_Engagement enforces owner-only writes.
 */
export async function recordLetterSignatureAsClient(input: RecordLetterSignatureInput & {
  clerkUserId: string;
  role: "CLIENT";
}): Promise<{ rowsAffected: number }> {
  // DECISION (TASK-005-005): Use raw mssql request pool with SESSION_CONTEXT set IN THE SAME
  // BATCH as the UPDATE — the BLOCK predicate evaluates SESSION_CONTEXT at the UPDATE boundary.
  // Mirror the proven pattern from engagement.client-isolation.rls.test.ts (L100-122, L286-298).
  // @read_only = 0 per ADR-003 Amendment 1 — never @read_only = 1.

  const requestUrl = process.env["DATABASE_URL"];
  if (!requestUrl) {
    throw new Error(
      "[packages/db] DATABASE_URL is not set. " +
        "Required for request-pool CLIENT signature write (ADR-003).",
    );
  }

  const mssql = mssqlPkg;
  const { ConnectionPool: MssqlConnectionPool } = mssql;
  const config = parseSqlServerUrl(requestUrl);

  // Open a dedicated connection for this request (needed because getRequestDb is a Prisma
  // singleton — we need raw mssql to set SESSION_CONTEXT in-batch with a parameterised UPDATE).
  // DECISION (TASK-005-005): This creates a short-lived pool rather than a singleton to avoid
  // keeping request-pool connections open for the lifetime of the process in tests. The pool
  // is closed after the UPDATE. In production a shared request-pool singleton would be more
  // efficient, but the signing path is low-frequency (once per engagement) so the overhead is
  // acceptable. This can be optimised to a shared pool in a follow-up if needed.
  const pool = new MssqlConnectionPool(config);
  await pool.connect();

  try {
    // Injection-safety for sp_set_session_context args (cannot be parameterised in a .batch()):
    //   clerkUserId and role are server-derived from the verified session — never client-supplied.
    //   Single-quote-escaped before interpolation as string literals (mirror test helper pattern).
    //   The real authorization fence is sec.pol_Engagement FILTER+BLOCK (ADR-005).
    const escapedClerkId = input.clerkUserId.replace(/'/g, "''");
    const escapedRole = input.role.replace(/'/g, "''");

    // SEC-1: the three UPDATE data values (signatureEvidence, templateSnapshot, engagementId)
    // are bound via mssql .input() parameters and referenced as @-prefixed placeholders in the
    // batch text. Only the two sp_set_session_context args remain as escaped string literals
    // (they cannot be parameterised in a .batch()).
    const req = pool.request();
    req.input("signatureEvidence", mssql.NVarChar(mssql.MAX), input.signatureEvidence);
    req.input("templateSnapshot", mssql.NVarChar(mssql.MAX), input.templateSnapshot);
    req.input("engagementId", mssql.NVarChar(50), input.engagementId);

    const sql = `
      EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${escapedClerkId}', @read_only = 0;
      EXEC sp_set_session_context @key = N'role', @value = N'${escapedRole}', @read_only = 0;
      UPDATE [dbo].[Engagement]
      SET [letterSignedAt] = SYSDATETIMEOFFSET(),
          [letterSignatureEvidence] = @signatureEvidence,
          [letterTemplateSnapshot] = @templateSnapshot,
          [updatedAt] = SYSDATETIMEOFFSET()
      WHERE [id] = @engagementId;
      SELECT @@ROWCOUNT AS rowsAffected;
      EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
      EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;
    `;

    const result = await req.batch(sql);

    // The UPDATE recordset is in a middle position (between the sp_set calls before and after).
    // When there are N statements, recordsets[2] is the SELECT @@ROWCOUNT (0=sp_set, 1=sp_set,
    // 2=UPDATE, 3=SELECT, 4=sp_set, 5=sp_set). Actually SQL Server returns recordsets only for
    // statements that produce rows. The SELECT @@ROWCOUNT returns a single-row recordset.
    // The sp_set_session_context calls produce no rows (empty recordsets in the batch).
    // We find the first non-empty recordset after the sp_set calls that has rowsAffected.
    const recordsets = result.recordsets as Array<Array<{ rowsAffected?: number }>>;
    // The SELECT @@ROWCOUNT AS rowsAffected will be in a recordset — find it.
    let rowsAffected = 0;
    for (const rs of recordsets) {
      if (rs.length > 0 && rs[0] !== undefined && "rowsAffected" in rs[0]) {
        rowsAffected = rs[0].rowsAffected ?? 0;
        break;
      }
    }

    return { rowsAffected };
  } finally {
    await pool.close().catch(() => { /* ignore pool close errors */ });
  }
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
