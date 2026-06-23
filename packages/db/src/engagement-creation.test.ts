/**
 * packages/db/src/engagement-creation.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (DATABASE_URL_ADMIN)
 *
 * Tests the four engagement-creation data-layer seams (EPIC-012 / TASK-012-002):
 *   - createReturningClientRequest
 *   - createAccountantInitiatedEngagement
 *   - findDuplicateEngagements
 *   - addEngagementParticipant
 *
 * Acceptance criteria covered (AC-id test-tag contract, per BRIEF-012 methodology):
 *   AC-DOOR-009-03  — createReturningClientRequest reuses the caller's on-file contact
 *                     (no contact args required; interface accepts only clerkUserId + serviceIds)
 *   AC-DOOR-009-03  — the resolved contact is sourced from the User's existing EngagementRequest;
 *                     a different user's contact is not used
 *   AC-DOOR-009-04-dl  — the returning-client request lands as pending + notification created (inbox)
 *   AC-DOOR-010-04  — createAccountantInitiatedEngagement ties the engagement to the chosen client
 *                     (clientUserId set) and links them as a participant
 *   AC-DOOR-010-03-dl  — the accountant-initiated request is created already-accepted (no pending step)
 *   AC-LIFE-011-01  — findDuplicateEngagements returns the existing match for repeated (client,service,taxYear)
 *   AC-LIFE-011-02  — the returned match carries the existing engagementId
 *   AC-LIFE-011-03-dl  — creation proceeds (override) even when a duplicate exists — no hard block
 *   AC-LIFE-010-01  — a second engagement for the same client + different taxYear is created (both persist)
 *   AC-LIFE-012-01  — addEngagementParticipant links an additional participant to an engagement
 *   ADR-019         — each write seam records exactly one audit event (engagement-creation paths)
 *   CS-GEN-001      — audit rows contain no contact PII (no firstName/lastName/email)
 *
 * ADR-003 §7: admin pool writes use withAuditTransaction or direct admin pool.
 * ADR-005:    RLS-exempt admin pool for all seams (creation/duplication paths run on admin surface).
 * ADR-012:    Tier-3 test against the real SQL Server container.
 * ADR-019:    Each audit-event write is in the same transaction as the mutation (fail-closed).
 * CS-TS-001:  Seams do not bypass the packages/db wrapper — no raw pool import in seam code.
 * CS-TS-002:  Never import raw requestDb/adminDb pools outside packages/db.
 * CS-GEN-001: Contact PII (firstName/lastName/email) NEVER in audit rows.
 * CS-GEN-002: Additive — new test file; existing tests not modified.
 * CS-GEN-003: All governing keys cited throughout.
 *
 * Connection approach:
 *   - Seam calls use the seam functions under test (admin pool, via withAuditTransaction).
 *   - Setup / teardown and verification queries use direct raw mssql (admin pool).
 *   - No request-pool (SESSION_CONTEXT) needed — all seams are admin-pool writes/reads.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (taxportal_admin / app_admin_role; bypasses RLS)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import {
  createReturningClientRequest,
  createAccountantInitiatedEngagement,
  findDuplicateEngagements,
  addEngagementParticipant,
  UserNotFoundError,
  UserContactNotFoundError,
} from "./repositories/engagement-creation.js";
import type { AuditActor } from "./audit.js";

// CS-TS-001 // CS-TS-002 // ADR-003 // ADR-019 // CS-GEN-001 // CS-GEN-003

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Shared test data ─────────────────────────────────────────────────────────

/** Synthetic accountant actor for audit writes (ADR-019 §2). */
const ACCOUNTANT_ACTOR: AuditActor = {
  clerkUserId: "ec_test_accountant_001",
  role: "ACCOUNTANT",
};

/**
 * IDs for seeded entities — collected during tests and cleaned up in afterAll.
 * Cleanup order respects FK dependency: EngagementParticipant → Engagement → EngagementRequest → User.
 */
const cleanup = {
  participantIds: [] as string[],
  engagementIds: [] as string[],
  requestIds: [] as string[],
  notificationIds: [] as string[],
  userIds: [] as string[],
};

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) {
    throw new Error(
      "DATABASE_URL_ADMIN is required for engagement-creation integration tests",
    );
  }
  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();
}, 30_000);

afterAll(async () => {
  // Cleanup in FK dependency order (most-dependent first)
  for (const id of cleanup.participantIds) {
    await adminPool.request()
      .query(`DELETE FROM [dbo].[EngagementParticipant] WHERE [id] = '${id}'`)
      .catch(() => { /* ignore */ });
  }
  for (const id of cleanup.engagementIds) {
    await adminPool.request()
      .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${id}'`)
      .catch(() => { /* ignore */ });
  }
  for (const id of cleanup.notificationIds) {
    await adminPool.request()
      .query(`DELETE FROM [dbo].[Notification] WHERE [id] = '${id}'`)
      .catch(() => { /* ignore */ });
  }
  for (const id of cleanup.requestIds) {
    await adminPool.request()
      .query(`DELETE FROM [dbo].[EngagementRequestService] WHERE [engagementRequestId] = '${id}'`)
      .catch(() => { /* ignore */ });
    await adminPool.request()
      .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${id}'`)
      .catch(() => { /* ignore */ });
  }
  for (const id of cleanup.userIds) {
    await adminPool.request()
      .query(`DELETE FROM [dbo].[User] WHERE [id] = '${id}'`)
      .catch(() => { /* ignore */ });
  }
  await adminPool.close();
}, 30_000);

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/**
 * Seeds a Service row and returns its id.
 * Uses the existing seeded service if available (avoids polluting test data).
 * NOTE: Services are seeded via db:seed and not cleaned up here (they are reference data).
 */
async function getOrCreateService(name: string): Promise<string> {
  const result = await adminPool.request().query<{ id: string }>(
    `SELECT TOP 1 [id] FROM [dbo].[Service] WHERE [name] = N'${name.replace(/'/g, "''")}' AND [active] = 1`,
  );
  if (result.recordset[0]) {
    return result.recordset[0].id;
  }
  // Create a temporary service for testing
  const insertResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Service] ([name], [active], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${name.replace(/'/g, "''")}', 1, SYSDATETIMEOFFSET())`,
  );
  return insertResult.recordset[0]?.id ?? "";
}

/**
 * Seeds a User row (CLIENT role) with a minimal set of fields.
 * Tracks the id for cleanup.
 */
async function seedUser(suffix: string): Promise<{ userId: string; clerkId: string; email: string }> {
  const clerkId = `ec_test_user_${suffix}_${Date.now()}`;
  const email = `ec-test-${suffix}-${Date.now()}@example.com`;
  const result = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clerkId}', N'${email}', N'CLIENT', SYSDATETIMEOFFSET())`,
  );
  const userId = result.recordset[0]?.id ?? "";
  cleanup.userIds.push(userId);
  return { userId, clerkId, email };
}

/**
 * Seeds an EngagementRequest + Engagement (accepted + linked to a User) so the User
 * has on-file contact info for createReturningClientRequest.
 *
 * DECISION-E: the returning-client seam resolves contact via User→Engagement→EngagementRequest.
 * This helper creates the prerequisite accepted engagement that makes the contact resolvable.
 *
 * Tracks all created ids for cleanup.
 */
async function seedAcceptedEngagementForUser(params: {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  taxYear?: number;
}): Promise<{ requestId: string; engagementId: string }> {
  // INSERT EngagementRequest (accepted)
  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${params.firstName}', N'${params.lastName}',
             N'${params.email.toLowerCase()}', N'accepted', SYSDATETIMEOFFSET())`,
  );
  const requestId = reqResult.recordset[0]?.id ?? "";
  cleanup.requestIds.push(requestId);

  // INSERT Engagement linked to the User
  const taxYearClause = params.taxYear != null ? `, ${params.taxYear}` : ", NULL";
  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status]${params.taxYear != null ? ", [taxYear]" : ""}, [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${requestId}', '${params.userId}', N'New'${taxYearClause}, SYSDATETIMEOFFSET())`,
  );
  const engagementId = engResult.recordset[0]?.id ?? "";
  cleanup.engagementIds.push(engagementId);

  return { requestId, engagementId };
}

// ─── Audit helpers ────────────────────────────────────────────────────────────

/** Counts AuditEvent rows for a given targetId and action string. ADR-019 verification. */
async function countAuditRows(targetId: string, action: string): Promise<number> {
  const result = await adminPool.request().query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[AuditEvent]
     WHERE [targetId] = '${targetId}'
       AND [action] = N'${action.replace(/'/g, "''")}'`,
  );
  return result.recordset[0]?.cnt ?? 0;
}

/**
 * Checks whether any AuditEvent row for the given targetId contains contact PII.
 * CS-GEN-001: audit rows MUST NOT contain firstName/lastName/email values.
 *
 * We check the action, targetType, targetId columns (the only text columns on AuditEvent
 * that are not the actor identity). Actor identity IS stored per ADR-019 §2, but is not PII
 * in the sense of client contact data (firstName/lastName/email).
 *
 * Returns an array of any offending strings found (empty = clean).
 */
async function findPiiInAuditRows(
  targetId: string,
  piiValues: string[],
): Promise<string[]> {
  const result = await adminPool.request().query<{
    action: string;
    targetType: string | null;
    targetId: string | null;
  }>(
    `SELECT [action], [targetType], [targetId]
     FROM [dbo].[AuditEvent]
     WHERE [targetId] = '${targetId}'`,
  );

  const offenders: string[] = [];
  for (const row of result.recordset) {
    for (const pii of piiValues) {
      const rowStr = JSON.stringify(row).toLowerCase();
      if (pii && rowStr.includes(pii.toLowerCase())) {
        offenders.push(pii);
      }
    }
  }
  return offenders;
}

// ─── Test suites ──────────────────────────────────────────────────────────────

describe("createReturningClientRequest", () => {
  it(
    "[AC-DOOR-009-03] createReturningClientRequest reuses the caller's on-file contact — no contact args required",
    async () => {
      // The interface accepts only clerkUserId + serviceIds (no firstName/lastName/email).
      // This is the type-level proof of AC-DOOR-009-03: the input shape cannot accept PII re-entry.
      // CS-GEN-003 // DECISION-A // DECISION-E // AC-DOOR-009-03

      const serviceId = await getOrCreateService("EC-Test-Service-1");
      const { userId, clerkId, email } = await seedUser("retclient_contact");
      // Seed the prior accepted engagement so contact is resolvable (DECISION-E)
      await seedAcceptedEngagementForUser({
        userId,
        firstName: "Alice",
        lastName: "Returner",
        email,
        taxYear: 2023,
      });

      const result = await createReturningClientRequest({
        clerkUserId: clerkId,
        serviceIds: [serviceId],
      });

      // Clean up generated request + notification
      cleanup.notificationIds.push(result.notificationId);
      cleanup.requestIds.push(result.requestId);

      // Verify the created request has the on-file contact details (not client-supplied)
      const reqRow = await adminPool.request().query<{
        firstName: string;
        lastName: string;
        email: string;
        status: string;
      }>(
        `SELECT [firstName], [lastName], [email], [status]
         FROM [dbo].[EngagementRequest]
         WHERE [id] = '${result.requestId}'`,
      );
      const req = reqRow.recordset[0];
      expect(req).toBeDefined();
      // Contact copied from on-file data — not passed as args (proves AC-DOOR-009-03)
      expect(req!.firstName).toBe("Alice");
      expect(req!.lastName).toBe("Returner");
      expect(req!.email).toBe(email.toLowerCase());
    },
    30_000,
  );

  it(
    "[AC-DOOR-009-03] on-file contact is specific to the clerkUserId — different user's contact not used",
    async () => {
      // Two users with different contact info — each request uses their own on-file data.
      // CS-GEN-003 // AC-DOOR-009-03 // DECISION-E

      const serviceId = await getOrCreateService("EC-Test-Service-1");

      const userA = await seedUser("retclient_isolation_a");
      await seedAcceptedEngagementForUser({
        userId: userA.userId,
        firstName: "UserA",
        lastName: "First",
        email: userA.email,
        taxYear: 2023,
      });

      const userB = await seedUser("retclient_isolation_b");
      await seedAcceptedEngagementForUser({
        userId: userB.userId,
        firstName: "UserB",
        lastName: "Second",
        email: userB.email,
        taxYear: 2023,
      });

      const resultA = await createReturningClientRequest({
        clerkUserId: userA.clerkId,
        serviceIds: [serviceId],
      });
      cleanup.notificationIds.push(resultA.notificationId);
      cleanup.requestIds.push(resultA.requestId);

      const resultB = await createReturningClientRequest({
        clerkUserId: userB.clerkId,
        serviceIds: [serviceId],
      });
      cleanup.notificationIds.push(resultB.notificationId);
      cleanup.requestIds.push(resultB.requestId);

      // Verify each request has its own contact info
      const reqA = await adminPool.request().query<{ firstName: string }>(
        `SELECT [firstName] FROM [dbo].[EngagementRequest] WHERE [id] = '${resultA.requestId}'`,
      );
      const reqB = await adminPool.request().query<{ firstName: string }>(
        `SELECT [firstName] FROM [dbo].[EngagementRequest] WHERE [id] = '${resultB.requestId}'`,
      );

      expect(reqA.recordset[0]?.firstName).toBe("UserA");
      expect(reqB.recordset[0]?.firstName).toBe("UserB");
    },
    30_000,
  );

  it(
    "[AC-DOOR-009-04-dl] the returning-client request lands as a pending EngagementRequest with a new-request notification (inbox-bound)",
    async () => {
      // AC-DOOR-009-04 data-layer slice: status='pending' + notification created.
      // CS-GEN-003 // DECISION-A // AC-DOOR-009-03

      const serviceId = await getOrCreateService("EC-Test-Service-2");
      const { userId, clerkId, email } = await seedUser("retclient_pending");
      await seedAcceptedEngagementForUser({
        userId,
        firstName: "Bob",
        lastName: "Pending",
        email,
        taxYear: 2023,
      });

      const result = await createReturningClientRequest({
        clerkUserId: clerkId,
        serviceIds: [serviceId],
      });
      cleanup.notificationIds.push(result.notificationId);
      cleanup.requestIds.push(result.requestId);

      // Status must be 'pending'
      expect(result.status).toBe("pending");

      // Verify the Notification row exists and is of the correct type
      const notifRow = await adminPool.request().query<{
        id: string;
        type: string;
        engagementRequestId: string;
      }>(
        `SELECT [id], [type], [engagementRequestId]
         FROM [dbo].[Notification]
         WHERE [id] = '${result.notificationId}'`,
      );
      const notif = notifRow.recordset[0];
      expect(notif).toBeDefined();
      expect(notif!.type).toBe("new_engagement_request");
      expect(notif!.engagementRequestId).toBe(result.requestId);
    },
    30_000,
  );

  it(
    "[AC-DOOR-009-03] throws UserNotFoundError when clerkUserId has no User row",
    async () => {
      // Verify the error boundary: no silent no-op on missing user.
      const serviceId = await getOrCreateService("EC-Test-Service-1");
      await expect(
        createReturningClientRequest({
          clerkUserId: "clerk_nonexistent_ec_test",
          serviceIds: [serviceId],
        }),
      ).rejects.toThrow(UserNotFoundError);
    },
    30_000,
  );

  it(
    "[AC-DOOR-009-03] throws UserContactNotFoundError when User exists but has no prior EngagementRequest",
    async () => {
      // DECISION-E: if the user has no prior engagement, the contact cannot be resolved.
      const serviceId = await getOrCreateService("EC-Test-Service-1");
      const { clerkId } = await seedUser("retclient_nocontact");
      // Deliberately do NOT seed an accepted engagement for this user.

      await expect(
        createReturningClientRequest({
          clerkUserId: clerkId,
          serviceIds: [serviceId],
        }),
      ).rejects.toThrow(UserContactNotFoundError);
    },
    30_000,
  );
});

describe("createAccountantInitiatedEngagement", () => {
  it(
    "[AC-DOOR-010-04] createAccountantInitiatedEngagement ties the engagement to the chosen client (clientUserId set) and links them as a participant",
    async () => {
      // CS-GEN-003 // ADR-003 // DECISION-A // AC-DOOR-010-04 // AC-LIFE-012-01

      const serviceId = await getOrCreateService("EC-Test-Service-1");
      const { userId } = await seedUser("acc_initiated_client");
      // Seed a prior accepted engagement so contact is resolvable (DECISION-E)
      await seedAcceptedEngagementForUser({
        userId,
        firstName: "Carol",
        lastName: "Client",
        email: `carol-client-${Date.now()}@example.com`,
        taxYear: 2022,
      });

      const result = await createAccountantInitiatedEngagement({
        clientUserId: userId,
        serviceIds: [serviceId],
        taxYear: 2024,
        actor: ACCOUNTANT_ACTOR,
      });

      cleanup.engagementIds.push(result.engagementId);
      cleanup.requestIds.push(result.requestId);

      // Verify Engagement has correct clientUserId + taxYear
      const engRow = await adminPool.request().query<{
        clientUserId: string | null;
        taxYear: number | null;
        status: string;
      }>(
        `SELECT [clientUserId], [taxYear], [status]
         FROM [dbo].[Engagement]
         WHERE [id] = '${result.engagementId}'`,
      );
      const eng = engRow.recordset[0];
      expect(eng).toBeDefined();
      expect(eng!.clientUserId).toBe(userId);
      expect(eng!.taxYear).toBe(2024);
      expect(eng!.status).toBe("New");

      // Verify EngagementParticipant row exists for the primary client
      const partRow = await adminPool.request().query<{ userId: string }>(
        `SELECT [userId] FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = '${result.engagementId}' AND [userId] = '${userId}'`,
      );
      expect(partRow.recordset).toHaveLength(1);
      expect(partRow.recordset[0]?.userId).toBe(userId);

      // Track participant for cleanup
      const partId = await adminPool.request().query<{ id: string }>(
        `SELECT [id] FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = '${result.engagementId}' AND [userId] = '${userId}'`,
      );
      if (partId.recordset[0]) {
        cleanup.participantIds.push(partId.recordset[0].id);
      }
    },
    30_000,
  );

  it(
    "[AC-DOOR-010-03-dl] the accountant-initiated request is created already-accepted (no pending accept/decline step)",
    async () => {
      // DECISION-A: pre-'accepted' status — no accept/decline required.
      // CS-GEN-003 // DECISION-A // AC-DOOR-010-03

      const serviceId = await getOrCreateService("EC-Test-Service-1");
      const { userId } = await seedUser("acc_initiated_preaccepted");
      await seedAcceptedEngagementForUser({
        userId,
        firstName: "Dave",
        lastName: "Preaccepted",
        email: `dave-preaccepted-${Date.now()}@example.com`,
        taxYear: 2022,
      });

      const result = await createAccountantInitiatedEngagement({
        clientUserId: userId,
        serviceIds: [serviceId],
        taxYear: 2024,
        actor: ACCOUNTANT_ACTOR,
      });

      cleanup.engagementIds.push(result.engagementId);
      cleanup.requestIds.push(result.requestId);

      // Track participant for cleanup
      const partId = await adminPool.request().query<{ id: string }>(
        `SELECT [id] FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = '${result.engagementId}' AND [userId] = '${userId}'`,
      );
      if (partId.recordset[0]) {
        cleanup.participantIds.push(partId.recordset[0].id);
      }

      // The EngagementRequest must be 'accepted' immediately
      const reqRow = await adminPool.request().query<{ status: string }>(
        `SELECT [status] FROM [dbo].[EngagementRequest] WHERE [id] = '${result.requestId}'`,
      );
      expect(reqRow.recordset[0]?.status).toBe("accepted");

      // Engagement status = 'New' (DB default)
      expect(result.engagementStatus).toBe("New");
    },
    30_000,
  );

  it(
    "[ADR-019] createAccountantInitiatedEngagement records exactly one audit event in the same transaction",
    async () => {
      // ADR-019: audit event for engagement.created_by_accountant.
      // CS-GEN-001: no contact PII in audit rows.
      // CS-GEN-003 // ADR-019 // CS-GEN-001

      const serviceId = await getOrCreateService("EC-Test-Service-1");
      const { userId } = await seedUser("acc_initiated_audit");
      await seedAcceptedEngagementForUser({
        userId,
        firstName: "Eve",
        lastName: "Audited",
        email: `eve-audited-${Date.now()}@example.com`,
        taxYear: 2022,
      });

      const result = await createAccountantInitiatedEngagement({
        clientUserId: userId,
        serviceIds: [serviceId],
        taxYear: 2024,
        actor: ACCOUNTANT_ACTOR,
      });

      cleanup.engagementIds.push(result.engagementId);
      cleanup.requestIds.push(result.requestId);

      const partId = await adminPool.request().query<{ id: string }>(
        `SELECT [id] FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = '${result.engagementId}' AND [userId] = '${userId}'`,
      );
      if (partId.recordset[0]) {
        cleanup.participantIds.push(partId.recordset[0].id);
      }

      // Exactly one audit event for engagement.created_by_accountant
      const auditCount = await countAuditRows(
        result.engagementId,
        "engagement.created_by_accountant",
      );
      expect(auditCount).toBe(1);

      // CS-GEN-001: no contact PII in audit rows for this engagement
      const piiOffenders = await findPiiInAuditRows(result.engagementId, [
        "Eve",
        "Audited",
        "eve-audited",
      ]);
      expect(piiOffenders).toHaveLength(0);
    },
    30_000,
  );

  it(
    "[AC-LIFE-010-01] a second engagement for the same client + a different taxYear is created and both persist",
    async () => {
      // AC-LIFE-010-01: concurrent engagements for the same client (different taxYear) co-exist.
      // DECISION-C: no unique DB constraint blocks this.
      // CS-GEN-003 // DECISION-C // AC-LIFE-010-01

      const serviceId = await getOrCreateService("EC-Test-Service-1");
      const { userId } = await seedUser("concurrent_tax_years");
      await seedAcceptedEngagementForUser({
        userId,
        firstName: "Frank",
        lastName: "Concurrent",
        email: `frank-concurrent-${Date.now()}@example.com`,
        taxYear: 2021,
      });

      // Create first engagement (taxYear=2023)
      const result1 = await createAccountantInitiatedEngagement({
        clientUserId: userId,
        serviceIds: [serviceId],
        taxYear: 2023,
        actor: ACCOUNTANT_ACTOR,
      });
      cleanup.engagementIds.push(result1.engagementId);
      cleanup.requestIds.push(result1.requestId);

      // Track participant for cleanup
      const partId1 = await adminPool.request().query<{ id: string }>(
        `SELECT [id] FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = '${result1.engagementId}' AND [userId] = '${userId}'`,
      );
      if (partId1.recordset[0]) {
        cleanup.participantIds.push(partId1.recordset[0].id);
      }

      // Create second engagement (taxYear=2024, same client + same service)
      const result2 = await createAccountantInitiatedEngagement({
        clientUserId: userId,
        serviceIds: [serviceId],
        taxYear: 2024,
        actor: ACCOUNTANT_ACTOR,
      });
      cleanup.engagementIds.push(result2.engagementId);
      cleanup.requestIds.push(result2.requestId);

      const partId2 = await adminPool.request().query<{ id: string }>(
        `SELECT [id] FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = '${result2.engagementId}' AND [userId] = '${userId}'`,
      );
      if (partId2.recordset[0]) {
        cleanup.participantIds.push(partId2.recordset[0].id);
      }

      // Both engagements persist (AC-LIFE-010-01)
      const countResult = await adminPool.request().query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM [dbo].[Engagement]
         WHERE [id] IN ('${result1.engagementId}', '${result2.engagementId}')`,
      );
      expect(countResult.recordset[0]?.cnt).toBe(2);

      // Each has its own taxYear
      const eng1 = await adminPool.request().query<{ taxYear: number | null }>(
        `SELECT [taxYear] FROM [dbo].[Engagement] WHERE [id] = '${result1.engagementId}'`,
      );
      const eng2 = await adminPool.request().query<{ taxYear: number | null }>(
        `SELECT [taxYear] FROM [dbo].[Engagement] WHERE [id] = '${result2.engagementId}'`,
      );
      expect(eng1.recordset[0]?.taxYear).toBe(2023);
      expect(eng2.recordset[0]?.taxYear).toBe(2024);
    },
    30_000,
  );
});

describe("findDuplicateEngagements", () => {
  it(
    "[AC-LIFE-011-01][AC-LIFE-011-02] findDuplicateEngagements returns the existing match for a repeated (client, service, tax year)",
    async () => {
      // DECISION-C: query not constraint.
      // CS-GEN-003 // DECISION-C // AC-LIFE-011-01 // AC-LIFE-011-02

      const serviceId = await getOrCreateService("EC-Test-Service-1");
      const { userId } = await seedUser("dup_detect_positive");
      const prior = await seedAcceptedEngagementForUser({
        userId,
        firstName: "Grace",
        lastName: "Duplicate",
        email: `grace-duplicate-${Date.now()}@example.com`,
        taxYear: 2024,
      });

      // Seed the EngagementRequestService row for the prior engagement
      // (so the service overlap query can find it)
      const priorEngRow = await adminPool.request().query<{ engagementRequestId: string }>(
        `SELECT [engagementRequestId] FROM [dbo].[Engagement] WHERE [id] = '${prior.engagementId}'`,
      );
      const priorRequestId = priorEngRow.recordset[0]?.engagementRequestId ?? "";
      await adminPool.request().query(
        `INSERT INTO [dbo].[EngagementRequestService]
           ([engagementRequestId], [serviceId])
         VALUES ('${priorRequestId}', '${serviceId}')`,
      );
      // The prior requestId is already in cleanup.requestIds — EngagementRequestService will be
      // deleted when the parent EngagementRequest is deleted (or handle explicitly).

      // Query for duplicates
      const duplicates = await findDuplicateEngagements({
        clientUserId: userId,
        serviceIds: [serviceId],
        taxYear: 2024,
      });

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]!.engagementId).toBe(prior.engagementId);
      expect(duplicates[0]!.taxYear).toBe(2024);
      expect(duplicates[0]!.overlappingServiceIds).toContain(serviceId);
    },
    30_000,
  );

  it(
    "[AC-LIFE-011-01] findDuplicateEngagements returns empty when tax year does not match",
    async () => {
      // DECISION-C: taxYear is part of the duplicate tuple — different year = no match.
      // CS-GEN-003 // DECISION-C // AC-LIFE-011-01

      const serviceId = await getOrCreateService("EC-Test-Service-1");
      const { userId } = await seedUser("dup_detect_taxyr_miss");
      const prior = await seedAcceptedEngagementForUser({
        userId,
        firstName: "Heidi",
        lastName: "Nomatch",
        email: `heidi-nomatch-${Date.now()}@example.com`,
        taxYear: 2023,
      });

      // Seed service link for the prior engagement
      const priorEngRow = await adminPool.request().query<{ engagementRequestId: string }>(
        `SELECT [engagementRequestId] FROM [dbo].[Engagement] WHERE [id] = '${prior.engagementId}'`,
      );
      const priorRequestId = priorEngRow.recordset[0]?.engagementRequestId ?? "";
      await adminPool.request().query(
        `INSERT INTO [dbo].[EngagementRequestService]
           ([engagementRequestId], [serviceId])
         VALUES ('${priorRequestId}', '${serviceId}')`,
      );

      // Query with a DIFFERENT tax year — should return empty
      const duplicates = await findDuplicateEngagements({
        clientUserId: userId,
        serviceIds: [serviceId],
        taxYear: 2024, // different from 2023
      });

      expect(duplicates).toHaveLength(0);
    },
    30_000,
  );

  it(
    "[AC-LIFE-011-01] findDuplicateEngagements returns empty when service does not intersect",
    async () => {
      // DECISION-C: service intersection is required for a match.
      // CS-GEN-003 // DECISION-C // AC-LIFE-011-01

      const serviceId1 = await getOrCreateService("EC-Test-Service-3-A");
      const serviceId2 = await getOrCreateService("EC-Test-Service-3-B");
      const { userId } = await seedUser("dup_detect_svc_miss");
      const prior = await seedAcceptedEngagementForUser({
        userId,
        firstName: "Ivan",
        lastName: "Noservice",
        email: `ivan-noservice-${Date.now()}@example.com`,
        taxYear: 2024,
      });

      // Seed serviceId1 link for the prior engagement
      const priorEngRow = await adminPool.request().query<{ engagementRequestId: string }>(
        `SELECT [engagementRequestId] FROM [dbo].[Engagement] WHERE [id] = '${prior.engagementId}'`,
      );
      const priorRequestId = priorEngRow.recordset[0]?.engagementRequestId ?? "";
      await adminPool.request().query(
        `INSERT INTO [dbo].[EngagementRequestService]
           ([engagementRequestId], [serviceId])
         VALUES ('${priorRequestId}', '${serviceId1}')`,
      );

      // Query with serviceId2 (different service) — should return empty
      const duplicates = await findDuplicateEngagements({
        clientUserId: userId,
        serviceIds: [serviceId2],
        taxYear: 2024,
      });

      expect(duplicates).toHaveLength(0);
    },
    30_000,
  );

  it(
    "[AC-LIFE-011-03-dl] creation proceeds (override) even when a duplicate exists — no hard block",
    async () => {
      // DECISION-C: the seam returns matches but does NOT block creation.
      // The caller decides whether to proceed. This test proves the override path works:
      // createAccountantInitiatedEngagement succeeds even when findDuplicateEngagements returns matches.
      // CS-GEN-003 // DECISION-C // AC-LIFE-011-03

      const serviceId = await getOrCreateService("EC-Test-Service-1");
      const { userId } = await seedUser("dup_override");
      const prior = await seedAcceptedEngagementForUser({
        userId,
        firstName: "Judy",
        lastName: "Override",
        email: `judy-override-${Date.now()}@example.com`,
        taxYear: 2024,
      });

      // Seed service link for the prior engagement
      const priorEngRow = await adminPool.request().query<{ engagementRequestId: string }>(
        `SELECT [engagementRequestId] FROM [dbo].[Engagement] WHERE [id] = '${prior.engagementId}'`,
      );
      const priorRequestId = priorEngRow.recordset[0]?.engagementRequestId ?? "";
      await adminPool.request().query(
        `INSERT INTO [dbo].[EngagementRequestService]
           ([engagementRequestId], [serviceId])
         VALUES ('${priorRequestId}', '${serviceId}')`,
      );

      // Verify duplicate IS detected
      const duplicates = await findDuplicateEngagements({
        clientUserId: userId,
        serviceIds: [serviceId],
        taxYear: 2024,
      });
      expect(duplicates.length).toBeGreaterThanOrEqual(1);

      // Override: create anyway — must NOT throw
      const overrideResult = await createAccountantInitiatedEngagement({
        clientUserId: userId,
        serviceIds: [serviceId],
        taxYear: 2024,  // same taxYear as duplicate
        actor: ACCOUNTANT_ACTOR,
      });
      cleanup.engagementIds.push(overrideResult.engagementId);
      cleanup.requestIds.push(overrideResult.requestId);

      const partId = await adminPool.request().query<{ id: string }>(
        `SELECT [id] FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = '${overrideResult.engagementId}' AND [userId] = '${userId}'`,
      );
      if (partId.recordset[0]) {
        cleanup.participantIds.push(partId.recordset[0].id);
      }

      // The override engagement was created
      expect(overrideResult.engagementId).toBeTruthy();
      expect(overrideResult.engagementStatus).toBe("New");

      // Both the original and override engagement co-exist
      const countResult = await adminPool.request().query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM [dbo].[Engagement]
         WHERE [id] IN ('${prior.engagementId}', '${overrideResult.engagementId}')`,
      );
      expect(countResult.recordset[0]?.cnt).toBe(2);
    },
    30_000,
  );
});

describe("addEngagementParticipant", () => {
  it(
    "[AC-LIFE-012-01] addEngagementParticipant links an additional participant to an engagement",
    async () => {
      // AC-LIFE-012-01: an engagement can have more than one participant linked.
      // CS-GEN-003 // ADR-003 // ADR-019 // AC-LIFE-012-01

      // Seed engagement (direct insert — no need for the full creation seam here)
      const { userId: ownerUserId } = await seedUser("part_owner");
      const serviceId = await getOrCreateService("EC-Test-Service-1");
      const prior = await seedAcceptedEngagementForUser({
        userId: ownerUserId,
        firstName: "Kate",
        lastName: "Owner",
        email: `kate-owner-${Date.now()}@example.com`,
        taxYear: 2024,
      });
      const engagementId = prior.engagementId;

      // Seed a second user (the participant to link)
      const { userId: participantUserId } = await seedUser("part_additional");

      const result = await addEngagementParticipant({
        engagementId,
        userId: participantUserId,
        actor: ACCOUNTANT_ACTOR,
      });

      cleanup.participantIds.push(result.participantId);

      expect(result.outcome).toBe("linked");
      expect(result.participantId).toBeTruthy();

      // Verify the EngagementParticipant row exists
      const partRow = await adminPool.request().query<{ userId: string; role: string }>(
        `SELECT [userId], [role] FROM [dbo].[EngagementParticipant]
         WHERE [id] = '${result.participantId}'`,
      );
      expect(partRow.recordset).toHaveLength(1);
      expect(partRow.recordset[0]?.userId).toBe(participantUserId);
      expect(partRow.recordset[0]?.role).toBe("CLIENT");
    },
    30_000,
  );

  it(
    "[AC-LIFE-012-01] addEngagementParticipant is idempotent — linking the same participant twice returns already_linked",
    async () => {
      // Idempotency on @@unique([engagementId, userId]): no duplicate row, no error.
      // CS-GEN-003 // AC-LIFE-012-01

      const { userId } = await seedUser("part_idempotent");
      const prior = await seedAcceptedEngagementForUser({
        userId,
        firstName: "Lara",
        lastName: "Idempotent",
        email: `lara-idempotent-${Date.now()}@example.com`,
        taxYear: 2024,
      });
      const engagementId = prior.engagementId;
      const { userId: participantUserId } = await seedUser("part_idempotent_p");

      // First link
      const first = await addEngagementParticipant({
        engagementId,
        userId: participantUserId,
        actor: ACCOUNTANT_ACTOR,
      });
      cleanup.participantIds.push(first.participantId);
      expect(first.outcome).toBe("linked");

      // Second link (same engagementId + userId) — must be idempotent
      const second = await addEngagementParticipant({
        engagementId,
        userId: participantUserId,
        actor: ACCOUNTANT_ACTOR,
      });
      expect(second.outcome).toBe("already_linked");
      expect(second.participantId).toBe(first.participantId);

      // Verify only one EngagementParticipant row exists
      const countResult = await adminPool.request().query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = '${engagementId}' AND [userId] = '${participantUserId}'`,
      );
      expect(countResult.recordset[0]?.cnt).toBe(1);
    },
    30_000,
  );

  it(
    "[ADR-019] addEngagementParticipant records exactly one audit event on first link; none on re-link",
    async () => {
      // ADR-019: audit on actual state change (first link); no audit on no-op (re-link).
      // CS-GEN-001: audit row records engagementId — no contact PII.
      // CS-GEN-003 // ADR-019 // CS-GEN-001

      const { userId } = await seedUser("part_audit");
      const prior = await seedAcceptedEngagementForUser({
        userId,
        firstName: "Mia",
        lastName: "Audit",
        email: `mia-audit-${Date.now()}@example.com`,
        taxYear: 2024,
      });
      const engagementId = prior.engagementId;
      const { userId: participantUserId } = await seedUser("part_audit_p");

      const first = await addEngagementParticipant({
        engagementId,
        userId: participantUserId,
        actor: ACCOUNTANT_ACTOR,
      });
      cleanup.participantIds.push(first.participantId);

      // Exactly one audit event for first link
      const auditCountFirst = await countAuditRows(
        engagementId,
        "engagement.participant_added",
      );
      expect(auditCountFirst).toBe(1);

      // Re-link (no-op) — no additional audit event
      await addEngagementParticipant({
        engagementId,
        userId: participantUserId,
        actor: ACCOUNTANT_ACTOR,
      });

      const auditCountSecond = await countAuditRows(
        engagementId,
        "engagement.participant_added",
      );
      // Still exactly 1 (no audit on no-op re-link)
      expect(auditCountSecond).toBe(1);
    },
    30_000,
  );

  it(
    "[CS-GEN-001] addEngagementParticipant audit rows contain no contact PII",
    async () => {
      // CS-GEN-001: audit rows record only ids + action — no firstName/lastName/email.
      // CS-GEN-003 // CS-GEN-001 // ADR-019

      const { userId } = await seedUser("part_pii_check");
      const prior = await seedAcceptedEngagementForUser({
        userId,
        firstName: "NoPII",
        lastName: "InAudit",
        email: `nopii-inaudit-${Date.now()}@example.com`,
        taxYear: 2024,
      });
      const engagementId = prior.engagementId;
      const { userId: participantUserId } = await seedUser("part_pii_p");

      const result = await addEngagementParticipant({
        engagementId,
        userId: participantUserId,
        actor: ACCOUNTANT_ACTOR,
      });
      cleanup.participantIds.push(result.participantId);

      // No contact PII in audit rows
      const piiOffenders = await findPiiInAuditRows(engagementId, [
        "NoPII",
        "InAudit",
        "nopii-inaudit",
      ]);
      expect(piiOffenders).toHaveLength(0);
    },
    30_000,
  );
});
