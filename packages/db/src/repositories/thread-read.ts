/**
 * packages/db/src/repositories/thread-read.ts
 *
 * Data-access functions for ThreadReadState (EPIC-017 / TASK-017-003 + TASK-017-005).
 *
 * Write function: markThreadRead — upserts the per-viewer last-read watermark.
 * Read function:  listThreadsWithUnread — returns all threads visible to the viewer,
 *   each decorated with a derived `hasUnread` boolean (TASK-017-005).
 *
 * Pool strategy:
 *   REQUEST POOL (db / SESSION_CONTEXT) — used for both operations.
 *   For markThreadRead: the BLOCK predicate on sec.pol_ThreadReadState enforces own-row-only
 *     writes. A viewer can only INSERT/UPDATE their own row.
 *   For listThreadsWithUnread: sec.pol_Thread (FILTER) is the sole visibility boundary —
 *     no extra WHERE added on top of RLS (DECISION-017-002-A pattern). The query joins
 *     Thread ⋈ ThreadReadState (own-row only under RLS) and uses EXISTS over Message to
 *     derive hasUnread per viewer.
 *
 *   Must be called inside withRequestContext() / withClerkIdentity() so SESSION_CONTEXT is set.
 *
 * ADR-003: SESSION_CONTEXT identity propagation via db wrapper. // ADR-003
 * ADR-005: sec.pol_Thread / sec.pol_ThreadReadState are the enforcement boundaries. // ADR-005
 * ADR-006: consumed by both portal (CLIENT) + admin (ACCOUNTANT) action layers. // ADR-006
 * CS-TS-001: request-pool operations go through the db wrapper (SESSION_CONTEXT set). // CS-TS-001
 * CS-GEN-001: no message bodies or thread content logged. // CS-GEN-001
 * CS-GEN-002: additive — new function + types; no existing export removed or narrowed. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * AC-MSG-005-01: new message → unread for both participants.
 * AC-MSG-005-02: unread computation covers both 'engagement' and 'general' thread kinds.
 * AC-MSG-005-03: per-viewer divergence — thread can be unread for A and read for B simultaneously.
 * AC-MSG-005-04: markThreadRead sets the viewer's lastReadAt watermark (clears the indicator).
 */

import { db } from "../client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of markThreadRead.
 *
 * AC-MSG-005-04: the viewer's lastReadAt watermark is updated.
 * Returns the threadId and the new lastReadAt timestamp for confirmation.
 */
export interface MarkThreadReadResult {
  /** The Thread.id whose read state was updated. */
  threadId: string;
  /** The timestamp recorded as the new lastReadAt watermark. */
  lastReadAt: Date;
}

/**
 * A thread enriched with a per-viewer unread indicator.
 *
 * DECISION-017-005-A: hasUnread is a derived boolean, not a stored column.
 *   It is computed at read time from the DECISION-017-A watermark:
 *     hasUnread = EXISTS(message m WHERE m.threadId = t.id
 *                        AND m.createdAt > COALESCE(viewer.lastReadAt, '0001-01-01')
 *                        AND m.senderClerkId <> viewerClerkId)
 *   Excluding the viewer's own sent messages: a viewer does not get an unread badge
 *   for a message they sent (the badge is for messages received from others).
 *   NOTE on column naming: the brief/spec uses "senderUserId" for the exclusion,
 *   but Message.senderClerkId is the actual schema column (the sender's Clerk ID).
 *   SESSION_CONTEXT('clerk_user_id') is also a Clerk ID — the comparison is apples-to-apples.
 *   This is consistent with the senderClerkId pattern established in TASK-017-002/-003.
 *
 * AC-MSG-005-01/-02/-03/-04: derived from the DECISION-017-A watermark; per-viewer.
 */
export interface ThreadWithUnread {
  /** Thread.id (UNIQUEIDENTIFIER as string). */
  id: string;
  /** 'engagement' | 'general' — the two thread kinds (AC-MSG-005-02). */
  kind: "engagement" | "general";
  /** FK → Engagement.id; null for kind='general'. */
  engagementId: string | null;
  /** FK → User.id (the client); null for kind='engagement'. */
  clientUserId: string | null;
  /** Thread status: 'active' | 'archived'. */
  status: "active" | "archived";
  /** When the thread was archived; null if active. */
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * True iff the current viewer has unread messages in this thread.
   *
   * DECISION-017-005-A: derived at read time from the DECISION-017-A watermark.
   *   false = no messages after viewer's lastReadAt, or all unread messages are viewer's own.
   *   true  = at least one message from another participant after the viewer's lastReadAt.
   *   A viewer with no ThreadReadState row yet on a thread with other-authored messages → true.
   *
   * AC-MSG-005-01: new message → hasUnread=true for both participants initially.
   * AC-MSG-005-03: per-viewer — A can have hasUnread=true while B has hasUnread=false.
   * AC-MSG-005-04: markThreadRead clears hasUnread for the caller only.
   */
  hasUnread: boolean;
}

// ─── Read: listThreadsWithUnread (request pool — RLS-governed) ───────────────

/**
 * Returns all threads visible to the current SESSION_CONTEXT viewer, each annotated
 * with a derived `hasUnread` boolean.
 *
 * Pool: REQUEST POOL (db / SESSION_CONTEXT) — RLS via sec.pol_Thread is the sole
 * visibility enforcement boundary (DECISION-017-002-A: no extra WHERE added here).
 *
 * Unread derivation (DECISION-017-005-A / DECISION-017-A):
 *   hasUnread = EXISTS(
 *     SELECT 1 FROM [dbo].[Message] m
 *     WHERE m.threadId = t.id
 *       AND m.createdAt > COALESCE(trs.lastReadAt, '0001-01-01 00:00:00 +00:00')
 *       AND m.senderClerkId <> CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *   )
 *   Where trs is the viewer's own ThreadReadState row (left-joined on threadId + userId).
 *   A viewer with no ThreadReadState row yet (trs IS NULL) on a thread with messages
 *   from others → hasUnread = true (COALESCE falls back to epoch, and any message after
 *   epoch qualifies). // AC-MSG-005-01 // AC-MSG-005-03
 *
 * Coverage:
 *   - Both 'engagement' and 'general' thread kinds — no kind filter (AC-MSG-005-02).
 *   - Per-viewer divergence — each caller's SESSION_CONTEXT resolves their own read state.
 *     Viewer A and Viewer B can have different hasUnread values for the same thread.
 *     // AC-MSG-005-03
 *   - After markThreadRead: lastReadAt advances, so the EXISTS subquery finds no messages
 *     after the new watermark → hasUnread = false for that viewer only. // AC-MSG-005-04
 *
 * CS-GEN-001: message bodies are not selected or returned — query touches only createdAt/senderClerkId. // CS-GEN-001
 * CS-TS-001: request-pool raw query via db.$queryRaw (SESSION_CONTEXT set by middleware). // CS-TS-001
 * ADR-003: SESSION_CONTEXT set by withRequestContext / withClerkIdentity upstream. // ADR-003
 * ADR-005: sec.pol_Thread FILTER is the sole enforcement boundary (no extra WHERE). // ADR-005
 *
 * Must be called inside withRequestContext() / withClerkIdentity().
 *
 * @returns Array of ThreadWithUnread — all threads visible to this viewer, ordered by createdAt ASC.
 */
export async function listThreadsWithUnread(): Promise<ThreadWithUnread[]> {
  // CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
  // ADR-003: SESSION_CONTEXT is set upstream — SESSION_CONTEXT(N'clerk_user_id') is valid here. // ADR-003
  // ADR-005: sec.pol_Thread FILTER governs Thread visibility — no extra WHERE needed. // ADR-005
  //
  // Query design:
  //   1. SELECT Thread columns from [dbo].[Thread] t (RLS FILTER applies at this table scan).
  //   2. LEFT JOIN [dbo].[ThreadReadState] trs — join on (threadId, userId) where userId is
  //      the current viewer resolved from SESSION_CONTEXT.
  //      NOTE: sec.pol_ThreadReadState FILTER scopes the join to the viewer's own row under
  //      the request pool — the JOIN does not cross-pollinate other viewers' read states.
  //   3. Computed hasUnread: EXISTS over Message with createdAt > viewer's lastReadAt
  //      AND senderClerkId <> viewer's clerkId (exclude own messages).
  //
  // DECISION-017-005-A: senderClerkId is used for the "exclude own messages" check because
  //   Message.senderClerkId IS the schema column. The brief spec writes "senderUserId" but
  //   that does not exist in Message — senderClerkId is the correct field. SESSION_CONTEXT
  //   'clerk_user_id' is a Clerk ID — the comparison is valid apples-to-apples.
  //   This is documented in ThreadWithUnread above and noted here for greppability.
  //
  // CS-GEN-001: only m.createdAt and m.senderClerkId are touched in the subquery — no body read. // CS-GEN-001
  // CS-GEN-003: governing keys cited above. // CS-GEN-003
  const rows = await (db as unknown as {
    $queryRaw: (
      template: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<Array<{
      id: string;
      kind: string;
      engagementId: string | null;
      clientUserId: string | null;
      status: string;
      archivedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      hasUnread: boolean | number;
    }>>;
  }).$queryRaw`
    SELECT
      t.[id],
      t.[kind],
      t.[engagementId],
      t.[clientUserId],
      t.[status],
      t.[archivedAt],
      t.[createdAt],
      t.[updatedAt],
      CASE WHEN EXISTS (
        SELECT 1
        FROM   [dbo].[Message] m
        WHERE  m.[threadId] = t.[id]
          AND  m.[createdAt] > COALESCE(
                 trs.[lastReadAt],
                 CAST(N'0001-01-01 00:00:00 +00:00' AS DATETIMEOFFSET)
               )
          AND  m.[senderClerkId] <> CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
      ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS [hasUnread]
    FROM  [dbo].[Thread] t
    LEFT  JOIN [dbo].[ThreadReadState] trs
           ON  trs.[threadId] = t.[id]
           AND trs.[userId] = (
                 SELECT [id]
                 FROM   [dbo].[User]
                 WHERE  [clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
               )
    ORDER BY t.[createdAt] ASC
  `;

  // SQL Server returns BIT as boolean in Prisma $queryRaw, but normalise defensively.
  // CS-GEN-001: no body or thread content is logged here. // CS-GEN-001
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as "engagement" | "general",
    engagementId: row.engagementId ?? null,
    clientUserId: row.clientUserId ?? null,
    status: row.status as "active" | "archived",
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // Normalise: Prisma may return BIT as boolean true/false OR as 1/0.
    hasUnread: Boolean(row.hasUnread),
  }));
}

// ─── Write: markThreadRead (request pool — RLS own-row write) ─────────────────

/**
 * Upserts the per-viewer last-read watermark for the given thread.
 *
 * Uses the REQUEST POOL (db / SESSION_CONTEXT) so the BLOCK predicate on
 * sec.pol_ThreadReadState enforces own-row-only writes. A viewer can only mark
 * their own read state — the predicate resolves the caller's User.id from
 * SESSION_CONTEXT('clerk_user_id') and allows writes only for that userId.
 *
 * Strategy (Prisma upsert):
 *   - WHERE @@unique([threadId, userId]) — matches the viewer's existing row.
 *   - If the row exists: UPDATE lastReadAt = now.
 *   - If no row exists: INSERT (threadId, userId, lastReadAt = now).
 *
 * DECISION-017-003-A: the UPSERT uses Prisma's upsert with the threadId; Prisma
 *   resolves the userId from the SESSION_CONTEXT propagated through the db wrapper.
 *   The threadId is server-resolved (never client-supplied — ADR-003 / CS-TS-004).
 *
 * Must be called inside withRequestContext() / withClerkIdentity() so SESSION_CONTEXT
 * is set before the Prisma middleware runs (ADR-003 Amendment 1 / BUG-002-003).
 *
 * AC-MSG-005-04: viewer's unread indicator is cleared by setting lastReadAt = now.
 * ADR-003: SESSION_CONTEXT propagated via db wrapper (withRequestContext caller). // ADR-003
 * ADR-005: sec.pol_ThreadReadState BLOCK predicate enforces own-row write. // ADR-005
 * CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
 * CS-GEN-001: no message bodies or viewer identity logged. // CS-GEN-001
 * CS-GEN-003: governing keys cited above. // CS-GEN-003
 *
 * @param threadId - The Thread.id to mark read (server-resolved — never client-supplied).
 * @returns MarkThreadReadResult — the threadId and the recorded lastReadAt timestamp.
 *
 * DECISION-017-003-A: userId is resolved by the DB from SESSION_CONTEXT via the RLS predicate —
 *   the repository does not accept a userId parameter (it would bypass the BLOCK guard).
 *   The Prisma upsert creates the row for the SESSION_CONTEXT-identified viewer only.
 */
export async function markThreadRead(threadId: string): Promise<MarkThreadReadResult> {
  // CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by withRequestContext). // CS-TS-001
  // DECISION-017-003-A: userId is not a param — it is embedded in the SESSION_CONTEXT and
  //   resolved by the DB predicate. The Prisma upsert uses a sub-select to get User.id.
  //
  // NOTE: Prisma upsert requires the "where" uniqueness key. For ThreadReadState,
  //   the @@unique is (threadId, userId). However, we cannot supply userId here because
  //   that would mean the action layer resolved it — bypassing the BLOCK guard.
  //
  // DECISION-017-003-B (implementation choice): use a raw SQL MERGE via Prisma's $queryRaw
  //   equivalent. We use Prisma's upsertMany or a raw executeRaw on the db wrapper to perform
  //   the MERGE without needing to know the userId in the application layer.
  //
  //   The raw SQL MERGE uses SESSION_CONTEXT('clerk_user_id') directly, so the userId is
  //   resolved by SQL Server — the application layer never touches it.
  //   The BLOCK predicate still fires on the resolved userId (own-row enforcement is intact).
  //
  // ADR-003 §7 note: this is a request-pool write (not admin-pool), so SESSION_CONTEXT IS needed.

  const now = new Date();

  // MERGE: if (threadId, userId) exists → UPDATE lastReadAt; else INSERT.
  // SESSION_CONTEXT('clerk_user_id') resolves the userId inside SQL Server.
  // The BLOCK predicate on sec.pol_ThreadReadState evaluates the resolved userId —
  // a caller who does not own the row will be blocked at the DB level (ADR-005).
  //
  // CS-TS-001: executed via the db wrapper (db.$executeRaw is on the Prisma request-pool client).
  //   The db.$extends wrapper sets SESSION_CONTEXT before each query. // CS-TS-001
  // CS-GEN-001: no PII / message bodies in this query. // CS-GEN-001
  await (db as unknown as {
    $executeRaw: (
      template: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<number>;
  }).$executeRaw`
    MERGE [dbo].[ThreadReadState] AS target
    USING (
        SELECT id AS userId
        FROM   [dbo].[User]
        WHERE  clerkId = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
    ) AS src ON target.threadId = ${threadId} AND target.userId = src.userId
    WHEN MATCHED THEN
        UPDATE SET [lastReadAt] = ${now}, [updatedAt] = ${now}
    WHEN NOT MATCHED THEN
        INSERT ([threadId], [userId], [lastReadAt], [updatedAt])
        VALUES (${threadId}, src.userId, ${now}, ${now});
  `;

  return { threadId, lastReadAt: now };
}
