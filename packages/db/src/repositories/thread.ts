/**
 * packages/db/src/repositories/thread.ts
 *
 * Data-access functions for Thread (messaging spine — EPIC-017 / TASK-017-002).
 *
 * Two thread kinds (DECISION-017-A):
 *   'engagement' — one per engagement, accountant-initiated or auto-created; @@unique([engagementId]).
 *   'general'   — a direct accountant→client thread; associated with the client (clientUserId).
 *
 * Pool strategy:
 *   WRITE functions (getOrCreateEngagementThread, createGeneralThread):
 *     Admin pool (app_admin_role, RLS-exempt) — server-authoritative; mirrors emitNotification pattern.
 *     ADR-003 §7: admin pool for mutations that run outside a request-context scope.
 *
 *   READ functions (getThreadForEngagement, getGeneralThreadsForClient, listThreadMessages):
 *     Request pool (db / SESSION_CONTEXT) — RLS-governed via sec.pol_Thread / sec.pol_Message.
 *     Must be called inside withRequestContext() / withClerkIdentity() (ADR-003).
 *     DECISION: no WHERE added on top of RLS — the policy is the sole enforcement boundary.
 *     Adding a WHERE clause here would mask a policy regression (mirror notification.ts DECISION-016-002-A).
 *     // DECISION-017-002-A
 *
 * Idempotency guard for getOrCreateEngagementThread (AC-MSG-001-01):
 *   The @@unique([engagementId]) index enforces one-thread-per-engagement at the DB level.
 *   On concurrent INSERT a duplicate-key violation (SQL Server error 2627 / 2601) is caught and
 *   the function re-reads the existing row — yielding exactly one thread in all cases.
 *   // DECISION-017-002-B
 *
 * ADR-003: SESSION_CONTEXT identity propagation via db wrapper / withClerkIdentity. // ADR-003
 * ADR-005: sec.pol_Thread / sec.pol_Message are the sole read enforcement boundaries. // ADR-005
 * ADR-006: reads consumed by both portal + admin surfaces (shared package). // ADR-006
 * CS-TS-001: request-pool reads go through the db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
 * CS-TS-002: admin pool via getAdminPool() inside this module only — not exported. // CS-TS-002
 * CS-GEN-001: no PII / message bodies in logs. // CS-GEN-001
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { db } from "../client.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A thread row returned from read operations.
 *
 * AC-MSG-001-01: one Thread per engagement (@@unique[engagementId]).
 * AC-MSG-001-02: thread visible only to participants (sec.pol_Thread FILTER enforces under request pool).
 * AC-MSG-006-01: general thread per client↔accountant pair.
 */
export interface ThreadItem {
  id: string;
  kind: "engagement" | "general";
  engagementId: string | null;
  clientUserId: string | null;
  status: "active" | "archived";
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A message row returned from listThreadMessages.
 *
 * AC-MSG-002-03: messages returned in chronological order (createdAt ASC).
 * AC-MSG-003-01/-02: body is stored verbatim — no transformation.
 */
export interface MessageItem {
  id: string;
  threadId: string;
  senderClerkId: string;
  /** Plain-text body — stored verbatim; no server-side interpretation (AC-MSG-003-01/-02). */
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for getOrCreateEngagementThread (idempotent).
 *
 * AC-MSG-001-01: one thread per engagement.
 * DECISION-017-002-B: idempotent via @@unique + catch-and-re-read on race.
 */
export interface GetOrCreateEngagementThreadInput {
  /** The Engagement.id to get/create a thread for (server-resolved — never client-supplied). */
  engagementId: string;
}

/**
 * Input for createGeneralThread (accountant-initiated).
 *
 * AC-MSG-006-01: general thread per client↔accountant pair.
 */
export interface CreateGeneralThreadInput {
  /**
   * The client's User.id (UNIQUEIDENTIFIER) to associate the general thread with.
   * Server-resolved from the verified session — never client-supplied.
   */
  clientUserId: string;
}

// ─── Write: getOrCreateEngagementThread (admin pool — idempotent) ─────────────

/**
 * Gets or creates the engagement thread for the given engagementId.
 *
 * Idempotent: concurrent calls yield exactly one thread (AC-MSG-001-01).
 * Strategy:
 *   1. Try to INSERT a new Thread row (kind='engagement', engagementId=@engagementId).
 *   2. If the @@unique([engagementId]) constraint fires (SQL Server error 2627/2601),
 *      catch it and SELECT the existing row.
 *   3. If INSERT returns a row, that is the new thread — return it.
 *
 * Always returns the single authoritative ThreadItem for that engagement.
 *
 * Uses the admin pool (ADR-003 §7: admin-pool write — server-authoritative, no SESSION_CONTEXT).
 * ADR-005: BLOCK predicate on the request pool prevents CLIENT from calling this path.
 *
 * AC-MSG-001-01: one Thread per engagement (@@unique constraint enforces).
 * // ADR-003 // ADR-005 // CS-TS-002 // DECISION-017-002-B
 */
export async function getOrCreateEngagementThread(
  input: GetOrCreateEngagementThreadInput,
): Promise<ThreadItem> {
  // CS-TS-002: admin pool via getAdminPool() — only inside packages/db. // CS-TS-002
  const pool = await getAdminPool();

  // DECISION-017-002-B: attempt INSERT; catch unique-violation and re-read.
  // SQL Server error number 2627 = unique constraint violation; 2601 = unique index violation.
  // Both codes indicate @@unique([engagementId]) fired (concurrent first-create race).
  try {
    const insertReq = new MssqlRequest(pool);
    insertReq.input("engagementId", mssqlPkg.UniqueIdentifier, input.engagementId);

    const insertResult = await insertReq.query<{
      id: string;
      kind: string;
      engagementId: string | null;
      clientUserId: string | null;
      status: string;
      archivedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `INSERT INTO [dbo].[Thread]
         ([kind], [engagementId], [updatedAt])
       OUTPUT
         INSERTED.[id],
         INSERTED.[kind],
         INSERTED.[engagementId],
         INSERTED.[clientUserId],
         INSERTED.[status],
         INSERTED.[archivedAt],
         INSERTED.[createdAt],
         INSERTED.[updatedAt]
       VALUES
         (N'engagement', @engagementId, SYSDATETIMEOFFSET())`,
    );

    const row = insertResult.recordset[0];
    if (row) {
      return mapThreadRow(row);
    }
  } catch (err: unknown) {
    // Catch unique-violation (SQL Server error 2627 or 2601) — concurrent race.
    // Re-read the existing row to maintain idempotency.
    // DECISION-017-002-B: catch-and-re-read is the standard SQL Server idempotency pattern.
    if (isSqlUniqueViolation(err)) {
      // Fall through to the SELECT below.
    } else {
      throw err;
    }
  }

  // Either no row was returned (edge case) or unique-violation caught.
  // Re-read the canonical row for this engagementId via admin pool.
  // ADR-003 §7: admin pool read is correct here — this is a server-side seam, not a client read.
  const selectReq = new MssqlRequest(pool);
  selectReq.input("engagementId", mssqlPkg.UniqueIdentifier, input.engagementId);

  const selectResult = await selectReq.query<{
    id: string;
    kind: string;
    engagementId: string | null;
    clientUserId: string | null;
    status: string;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `SELECT [id], [kind], [engagementId], [clientUserId], [status], [archivedAt], [createdAt], [updatedAt]
     FROM [dbo].[Thread]
     WHERE [engagementId] = @engagementId`,
  );

  const row = selectResult.recordset[0];
  if (!row) {
    throw new Error(
      `getOrCreateEngagementThread: no thread found for engagementId=${input.engagementId} after INSERT/re-read`,
    );
  }

  return mapThreadRow(row);
}

// ─── Write: createGeneralThread (admin pool — accountant-initiated) ──────────

/**
 * Creates a general (direct) thread between the accountant and a specific client.
 *
 * kind='general', clientUserId=@clientUserId, engagementId=NULL.
 * Accountant-initiated — called by the TASK-017-003/-004 action layer after verifying the
 * accountant's identity and resolving the target clientUserId server-side.
 *
 * DECISION: There is no per-client unique constraint on general threads — the accountant can
 * theoretically create multiple general threads with a single client (future feature space).
 * The action layer is responsible for thread discovery/deduplication if needed.
 *
 * Uses the admin pool (ADR-003 §7: admin-pool write — server-authoritative).
 * ADR-005: BLOCK predicate on the request pool prevents CLIENT from inserting threads.
 *
 * AC-MSG-006-01: general thread per client↔accountant (kind='general', clientUserId set).
 * AC-MSG-006-02: thread visible only to that client + accountant (sec.pol_Thread FILTER enforces).
 * // ADR-003 // ADR-005 // CS-TS-002 // DECISION-017-002-C
 */
export async function createGeneralThread(
  input: CreateGeneralThreadInput,
): Promise<ThreadItem> {
  // CS-TS-002: admin pool via getAdminPool() — only inside packages/db. // CS-TS-002
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("clientUserId", mssqlPkg.UniqueIdentifier, input.clientUserId);

  const result = await req.query<{
    id: string;
    kind: string;
    engagementId: string | null;
    clientUserId: string | null;
    status: string;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `INSERT INTO [dbo].[Thread]
       ([kind], [clientUserId], [updatedAt])
     OUTPUT
       INSERTED.[id],
       INSERTED.[kind],
       INSERTED.[engagementId],
       INSERTED.[clientUserId],
       INSERTED.[status],
       INSERTED.[archivedAt],
       INSERTED.[createdAt],
       INSERTED.[updatedAt]
     VALUES
       (N'general', @clientUserId, SYSDATETIMEOFFSET())`,
  );

  const row = result.recordset[0];
  if (!row) {
    throw new Error("createGeneralThread: INSERT did not return a row");
  }

  return mapThreadRow(row);
}

// ─── Read: getThreadById (request pool — RLS-governed) ───────────────────────

/**
 * Returns a single Thread by its id, as seen by the current SESSION_CONTEXT identity.
 *
 * Primarily used to resolve a general thread for the `/messages/[threadId]` route on
 * both portal (CLIENT) and admin (ACCOUNTANT) surfaces. The engagement-thread view uses
 * getThreadForEngagement instead (keyed by engagementId), but general threads have no
 * engagementId and must be resolved directly by Thread.id.
 *
 * Under sec.pol_Thread (0014-thread-policy.sql):
 *   - CLIENT sees only threads they are a participant in (clientUserId match).
 *   - ACCOUNTANT sees all threads (IS_MEMBER('app_admin_role')=1).
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * DECISION-017-002-A: No WHERE clause added beyond the id filter — the repository
 *   does not add its own access WHERE on top of RLS. sec.pol_Thread is the sole
 *   enforcement boundary (ADR-005 §3). Adding a WHERE clause here (e.g. clientUserId
 *   or engagementId) would mask a policy regression.
 *
 * A non-participant resolving another client's threadId gets null → the page renders
 * 404. This is the IDOR gate (ADR-005 / CS-TS-001): the policy is the sole boundary.
 *
 * Must be called inside withRequestContext() / withClerkIdentity() (ADR-003).
 *
 * Returns null when:
 *   - No thread exists with the given id.
 *   - The caller's SESSION_CONTEXT does not satisfy the FILTER predicate (fail-closed).
 *
 * AC-MSG-002-02: general thread visible to accountant + the associated client (RLS gate).
 * AC-MSG-002-03: ordered message history readable by both participants.
 * AC-MSG-001-04: both parties can read + contribute via this thread.
 * // ADR-003 // ADR-005 // CS-TS-001 // DECISION-017-002-A
 */
export async function getThreadById(threadId: string): Promise<ThreadItem | null> {
  // CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
  // DECISION-017-002-A: No extra WHERE (e.g. clientUserId / engagementId) — RLS is the gate.
  // A non-participant resolving another client's threadId gets null (fail-closed). // ADR-005
  const row = await (db as unknown as {
    thread: {
      findFirst: (args: {
        where: { id: string };
      }) => Promise<{
        id: string;
        kind: string;
        engagementId: string | null;
        clientUserId: string | null;
        status: string;
        archivedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      } | null>;
    };
  }).thread.findFirst({
    where: { id: threadId },
  });

  if (!row) return null;
  return mapThreadRow(row);
}

// ─── Read: getThreadForEngagement (request pool — RLS-governed) ──────────────

/**
 * Returns the Thread for the given engagementId, as seen by the current SESSION_CONTEXT identity.
 *
 * Under sec.pol_Thread (0014-thread-policy.sql):
 *   - CLIENT (participant) sees the thread for their own engagement.
 *   - ACCOUNTANT sees all threads.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * DECISION-017-002-A: No WHERE clause added beyond the engagementId filter — the repository
 *   does not add its own access WHERE on top of RLS. sec.pol_Thread is the sole enforcement
 *   boundary (ADR-005 §3). Adding a WHERE clause here would mask a policy regression.
 *
 * Must be called inside withRequestContext() / withClerkIdentity() (ADR-003).
 *
 * Returns null when:
 *   - No thread exists for the engagement yet.
 *   - The caller's SESSION_CONTEXT does not satisfy the FILTER predicate (fail-closed).
 *
 * AC-MSG-001-02: thread visible only to participants (RLS is the gate).
 * // ADR-003 // ADR-005 // CS-TS-001 // DECISION-017-002-A
 */
export async function getThreadForEngagement(
  engagementId: string,
): Promise<ThreadItem | null> {
  // CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
  const rows = await (db as unknown as {
    thread: {
      findFirst: (args: {
        where: { engagementId: string };
      }) => Promise<{
        id: string;
        kind: string;
        engagementId: string | null;
        clientUserId: string | null;
        status: string;
        archivedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      } | null>;
    };
  }).thread.findFirst({
    where: { engagementId },
  });

  if (!rows) return null;
  return mapThreadRow(rows);
}

// ─── Read: getGeneralThreadsForClient (request pool — RLS-governed) ──────────

/**
 * Returns all general threads associated with the given client User.id, as seen by the
 * current SESSION_CONTEXT identity.
 *
 * Under sec.pol_Thread (0014-thread-policy.sql):
 *   - CLIENT sees their own general threads (clientUserId match).
 *   - ACCOUNTANT sees all general threads.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * DECISION-017-002-A: No WHERE kind='general' OR additional access WHERE added here —
 *   sec.pol_Thread is the sole enforcement boundary (ADR-005 §3).
 *   The clientUserId filter narrows the result set but does NOT replace RLS.
 *   An additional kind filter is additive and safe; we add it here for correctness
 *   since this function is specifically for general threads.
 *
 * Must be called inside withRequestContext() / withClerkIdentity() (ADR-003).
 *
 * Returns an empty array when no general threads exist for the client or the caller
 * cannot see them.
 *
 * AC-MSG-006-01: general thread per client↔accountant pair.
 * AC-MSG-006-02: visible only to that client + accountant (RLS is the gate).
 * // ADR-003 // ADR-005 // CS-TS-001 // DECISION-017-002-A
 */
export async function getGeneralThreadsForClient(
  clientUserId: string,
): Promise<ThreadItem[]> {
  // CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
  const rows = await (db as unknown as {
    thread: {
      findMany: (args: {
        where: { clientUserId: string; kind: string };
        orderBy: { createdAt: "asc" | "desc" };
      }) => Promise<Array<{
        id: string;
        kind: string;
        engagementId: string | null;
        clientUserId: string | null;
        status: string;
        archivedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }>>;
    };
  }).thread.findMany({
    where: { clientUserId, kind: "general" },
    orderBy: { createdAt: "asc" },
  });

  return rows.map(mapThreadRow);
}

// ─── Read: listThreadMessages (request pool — RLS-governed) ──────────────────

/**
 * Returns all messages in the given thread, ordered by createdAt ASC (chronological).
 *
 * Under sec.pol_Message (0015-message-policy.sql):
 *   - Participation is resolved through the parent Thread.
 *   - CLIENT sees messages in threads they participate in.
 *   - ACCOUNTANT sees all messages.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * DECISION-017-002-A: No WHERE clause added on top of RLS — sec.pol_Message is the sole
 *   enforcement boundary (ADR-005 §3). The threadId filter is correct (we want messages
 *   for a specific thread), but access enforcement is left entirely to the RLS policy.
 *
 * Body is returned verbatim — no transformation or interpretation at the storage layer.
 *   (AC-MSG-003-01/-02: plain-text — render-side verbatim proof is TASK-017-006/-007.)
 *
 * CS-GEN-001: message bodies must not be logged. // CS-GEN-001
 *
 * Must be called inside withRequestContext() / withClerkIdentity() (ADR-003).
 *
 * Returns an empty array when no messages exist or the thread is not visible (RLS).
 *
 * AC-MSG-001-03 / AC-MSG-002-03: messages returned in send order (createdAt ASC).
 * AC-MSG-003-01/-02: body stored verbatim — returned verbatim here.
 * // ADR-003 // ADR-005 // CS-TS-001 // CS-GEN-001 // DECISION-017-002-A
 */
export async function listThreadMessages(threadId: string): Promise<MessageItem[]> {
  // CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
  const rows = await (db as unknown as {
    message: {
      findMany: (args: {
        where: { threadId: string };
        orderBy: { createdAt: "asc" };
      }) => Promise<Array<{
        id: string;
        threadId: string;
        senderClerkId: string;
        body: string;
        createdAt: Date;
        updatedAt: Date;
      }>>;
    };
  }).message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });

  // CS-GEN-001: do not log message bodies or thread id in this read path. // CS-GEN-001
  return rows.map((row) => ({
    id: row.id,
    threadId: row.threadId,
    senderClerkId: row.senderClerkId,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

// ─── Write: archiveEngagementThread (admin pool — idempotent) ────────────────

/**
 * Archives the engagement thread for the given engagementId.
 *
 * Sets Thread.status='archived' and Thread.archivedAt=SYSDATETIMEOFFSET() WHERE the
 * engagement's thread exists AND status='active'. The WHERE status='active' guard makes
 * this call idempotent — archiving an already-archived thread is a silent no-op (no error,
 * no double-update). Nothing is deleted: this is a state flip only.
 *
 * Wire point: called additively from transitionEngagementStatus when toStatus='Complete'
 * (EPIC-010 seam, EPIC-017 / TASK-017-007). Mirrors the setEngagementCompleted precedent
 * (EPIC-014 / TASK-014-002): same post-commit, idempotent, additive shape (CS-GEN-002).
 *
 * Archive-on-close semantics (ADR-018 tier-3 / REQ-MSG-006):
 *   - Threads are kept INDEFINITELY — no purge, no 90-day floor (distinct from EPIC-016 ≥90d).
 *   - The RLS read predicates (TASK-017-001) do NOT filter on Thread.status → archived threads
 *     remain fully readable by participants (AC-MSG-006-03). Do NOT add a status filter here.
 *   - General threads (engagementId IS NULL) are never affected by this path because the WHERE
 *     keys on engagementId — a general thread has no engagementId and will not be matched.
 *
 * Uses the admin pool (ADR-003 §7: admin-pool write — server-authoritative, no SESSION_CONTEXT).
 * ADR-005: the archive path does not bypass RLS for reads — only the write uses the admin pool.
 *
 * Returns void — callers do not need to inspect the outcome (idempotent by design).
 *
 * AC-MSG-006-01: archive = state flip, not delete — thread + all messages remain present.
 * AC-MSG-006-02: archived thread still visible to participants (RLS read predicates unchanged).
 * AC-MSG-006-03: archived thread stays fully readable by participants.
 * // ADR-003 // ADR-018 // ADR-019 // CS-TS-002 // CS-GEN-002 // CS-GEN-003
 * // AC-MSG-006-01 // AC-MSG-006-02 // AC-MSG-006-03 // EPIC-010 // EPIC-017
 */
export async function archiveEngagementThread(engagementId: string): Promise<void> {
  // CS-TS-002: admin pool via getAdminPool() — only inside packages/db. // CS-TS-002
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("engagementId", mssqlPkg.UniqueIdentifier, engagementId);

  // Idempotent UPDATE: only flips status='archived' when the thread is currently 'active'.
  // WHERE status='active' guard: archiving an already-archived thread is a no-op (@@ROWCOUNT=0).
  // ADR-018 tier-3: threads are kept INDEFINITELY — this UPDATE is a state flip, NOT a delete.
  // DECISION-017-007-A: archivedAt is stamped via SYSDATETIMEOFFSET() at the DB level (server clock).
  // CS-GEN-002: additive — does not touch messages or any other table; only Thread.status.
  await req.query(
    `UPDATE [dbo].[Thread]
     SET [status]     = N'archived',
         [archivedAt] = SYSDATETIMEOFFSET(),
         [updatedAt]  = SYSDATETIMEOFFSET()
     WHERE [engagementId] = @engagementId
       AND [status]       = N'active'`,
  );
  // Note: @@ROWCOUNT=0 (already archived or no thread exists) is silently ignored — idempotent.
  // ADR-018: no message rows are touched; messages are retained indefinitely.
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Maps a raw SQL / Prisma Thread row to a ThreadItem.
 * Normalises the discriminant strings to the canonical union types.
 */
function mapThreadRow(row: {
  id: string;
  kind: string;
  engagementId: string | null;
  clientUserId: string | null;
  status: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ThreadItem {
  return {
    id: row.id,
    kind: row.kind as "engagement" | "general",
    engagementId: row.engagementId ?? null,
    clientUserId: row.clientUserId ?? null,
    status: row.status as "active" | "archived",
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Returns true when the error is a SQL Server unique-constraint or unique-index violation.
 *
 * SQL Server error numbers:
 *   2627 — Violation of UNIQUE KEY constraint.
 *   2601 — Cannot insert duplicate key row in object with unique index.
 *
 * DECISION-017-002-B: Used in getOrCreateEngagementThread to catch the concurrent-race case.
 */
function isSqlUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as Record<string, unknown>)["number"];
  return code === 2627 || code === 2601;
}
