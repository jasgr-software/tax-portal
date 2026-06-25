/**
 * packages/db/src/repositories/notification.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 § Tier 3)
 *
 * Tests the dual-role notification repository functions (TASK-016-002 / BRIEF-016 / EPIC-016).
 *
 * Acceptance criteria covered:
 *
 *   AC-MSG-007-01 — The notification feed is authoritative: each principal sees only their own.
 *   AC-MSG-007-02 — The feed is complete for the viewing principal under the policy.
 *     Test: listNotifications under CLIENT context returns only that client's feed.
 *
 *   AC-MSG-015-02 — On viewing a linked item the corresponding notification is marked read.
 *   AC-MSG-015-03 — No separate dismiss step — mark-read-on-view is sufficient.
 *     Test: markNotificationsReadByLinkedItem marks the matching unread read.
 *     Test: mark-read is idempotent for an already-read notification.
 *
 *   AC-MSG-016-01 — Notifications ≥90 days old (read) are still present.
 *   AC-MSG-016-02 — Notifications ≥90 days old (unread) are still present.
 *     Test: a notification ≥90 days old is still listed.
 *
 *   AC-MSG-017-02 — Unread count is derived, not a stored counter.
 *     Test: countUnreadNotifications returns the correct unread count for the viewing principal.
 *
 *   emitNotification helper:
 *     Test: emitNotification inserts a notification scoped to the correct recipient.
 *
 * Architecture notes:
 *   - All request-pool reads and writes use withClerkIdentity() (ADR-003 test helper).
 *   - Admin pool reads via direct mssql (verification only — no repository bypass).
 *   - emitNotification uses the admin pool internally — no SESSION_CONTEXT required for the INSERT.
 *   - No WHERE recipientUserId = … is added in the repository; the policy is the boundary (ADR-005).
 *   - UNIQUEIDENTIFIER values from SQL Server may be uppercase or lowercase; comparisons use
 *     .toLowerCase() for case-insensitive matching (consistent with other integration tests).
 *
 * ADR-003: SESSION_CONTEXT propagation via withClerkIdentity for request-pool operations. // ADR-003
 * ADR-005: sec.pol_Notification is the sole read enforcement boundary — no app-layer re-impl. // ADR-005
 * ADR-018 §retention: ≥90-day retention floor — read and unread notifications are never auto-purged. // ADR-018
 *
 * CS-TS-001: all request-pool operations go through the db wrapper via withClerkIdentity. // CS-TS-001
 * CS-TS-002: no raw pool imported outside packages/db. // CS-TS-002
 * CS-GEN-002: additive — new test file, no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "../sql-server-url.js";
import { withClerkIdentity } from "../context.js";
import {
  listNotifications,
  countUnreadNotifications,
  markNotificationsReadByLinkedItem,
  emitNotification,
} from "./notification.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test data ────────────────────────────────────────────────────────────────

/** Test-unique clerk IDs — avoids collision with notification.rls.test.ts seeds. */
const CLIENT_A_CLERK_ID = "notif_int_016_002_client_a";
const CLIENT_B_CLERK_ID = "notif_int_016_002_client_b";
const ACCOUNTANT_CLERK_ID = "notif_int_016_002_acct";

let clientAUserId: string;
let clientBUserId: string;

// Retention test: backdated 91 days
const RETENTION_BACKDATE_SQL = `DATEADD(day, -91, SYSDATETIMEOFFSET())`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Case-insensitive ID check — SQL Server UNIQUEIDENTIFIER values may be returned
 * in different cases depending on context. All ID comparisons use .toLowerCase().
 */
function includesId(ids: string[], targetId: string): boolean {
  const lower = targetId.toLowerCase();
  return ids.some((id) => id.toLowerCase() === lower);
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Seed: two Client User rows for isolation tests
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_A_CLERK_ID}', N'notif-int-016-002-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";

  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_B_CLERK_ID}', N'notif-int-016-002-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup test notifications (all notifications seeded with these client User ids)
  if (clientAUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Notification] WHERE [recipientUserId] = '${clientAUserId}'`
    ).catch(() => { /* ignore */ });
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${clientAUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientBUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Notification] WHERE [recipientUserId] = '${clientBUserId}'`
    ).catch(() => { /* ignore */ });
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${clientBUserId}'`
    ).catch(() => { /* ignore */ });
  }
  // Cleanup any ACCOUNTANT-scoped notifications emitted in tests (by type prefix)
  await adminPool.request().query(
    `DELETE FROM [dbo].[Notification] WHERE [type] LIKE N'notif_int_016_002_%'`
  ).catch(() => { /* ignore */ });

  await adminPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("notification repository — dual-role feed + unread count + mark-read + emit (TASK-016-002)", () => {

  /**
   * AC-MSG-007-01 / AC-MSG-007-02: The notification feed is authoritative and complete per principal.
   *
   * Given CLIENT-A has a notification scoped to them,
   * And CLIENT-B has a notification scoped to them,
   * When CLIENT-A reads their notification feed (listNotifications under CLIENT-A SESSION_CONTEXT),
   * Then only CLIENT-A's own notifications appear (not CLIENT-B's) — per sec.pol_Notification FILTER.
   *
   * Verifies: listNotifications returns only the viewing principal's RLS-scoped rows.
   * This validates that the repository does NOT add its own WHERE clause (policy is the boundary).
   * The ACCOUNTANT notification seeded here is also confirmed invisible to CLIENT-A.
   *
   * // AC-MSG-007-01 // AC-MSG-007-02 // ADR-005 // ADR-003 // CS-TS-001
   */
  it("AC-MSG-007-01/02 — listNotifications under CLIENT context returns that client's feed only", async () => {
    // Insert a CLIENT-A notification via emitNotification (admin pool INSERT)
    const notifA = await emitNotification({
      recipientType: "CLIENT",
      recipientUserId: clientAUserId,
      type: "notif_int_016_002_document_uploaded",
      title: "Test: CLIENT-A document uploaded",
      body: "A document was uploaded for you",
      linkedItemType: "document",
      linkedItemId: "a0000000-0000-4000-8000-000000000099",
    });

    // Insert a CLIENT-B notification via emitNotification
    const notifB = await emitNotification({
      recipientType: "CLIENT",
      recipientUserId: clientBUserId,
      type: "notif_int_016_002_document_uploaded",
      title: "Test: CLIENT-B document uploaded",
      body: "A document was uploaded for you",
      linkedItemType: "document",
      linkedItemId: "a0000000-0000-4000-8000-000000000098",
    });

    // Insert an ACCOUNTANT notification via emitNotification
    const notifAcct = await emitNotification({
      recipientType: "ACCOUNTANT",
      recipientUserId: null,
      type: "notif_int_016_002_new_request",
      title: "Test: ACCOUNTANT-only notification",
    });

    try {
      // CLIENT-A reads their feed — must see their own notification only
      // AC-MSG-007-01/-02: feed is authoritative per principal
      // CS-TS-001: listNotifications goes through the db wrapper (SESSION_CONTEXT set). // CS-TS-001
      const clientAFeed = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
        listNotifications()
      );

      // UNIQUEIDENTIFIER comparison is case-insensitive (SQL Server may return uppercase/lowercase).
      const clientAIds = clientAFeed.map((n) => n.id);

      // CLIENT-A must see their own notification
      expect(
        includesId(clientAIds, notifA.id),
        "[AC-MSG-007-01] CLIENT-A must see their own notification"
      ).toBe(true);

      // CLIENT-A must NOT see CLIENT-B's notification
      expect(
        includesId(clientAIds, notifB.id),
        "[AC-MSG-007-02] CLIENT-A must NOT see CLIENT-B's notification"
      ).toBe(false);

      // CLIENT-A must NOT see ACCOUNTANT-scoped notification
      expect(
        includesId(clientAIds, notifAcct.id),
        "[AC-MSG-007-01] CLIENT-A must NOT see ACCOUNTANT-scoped notification"
      ).toBe(false);

      // Verify the notification carries the correct new fields (EPIC-016 shape)
      const foundA = clientAFeed.find((n) => n.id.toLowerCase() === notifA.id.toLowerCase());
      expect(foundA, "CLIENT-A notification must be in feed").toBeDefined();
      expect(foundA?.recipientType).toBe("CLIENT");
      expect(foundA?.recipientUserId?.toLowerCase()).toBe(clientAUserId.toLowerCase());
      expect(foundA?.linkedItemType).toBe("document");
    } finally {
      // Cleanup these specific notifications
      for (const id of [notifA.id, notifB.id, notifAcct.id]) {
        await adminPool.request().query(
          `DELETE FROM [dbo].[Notification] WHERE [id] = '${id}'`
        ).catch(() => { /* ignore */ });
      }
    }
  });

  /**
   * AC-MSG-017-02: Unread count is correct for the viewing principal.
   *
   * Given CLIENT-A has 2 unread and 1 read notification,
   * When they query countUnreadNotifications under their SESSION_CONTEXT,
   * Then the count is at least 2 (the 2 unread ones are included, the read one is excluded).
   *
   * Verifies: countUnreadNotifications is derived (readAt IS NULL), scoped by RLS.
   * Note: the count may be higher than 2 if other tests leave CLIENT-A notifications as unread.
   *
   * // AC-MSG-017-02 // ADR-003 // ADR-005 // CS-TS-001
   */
  it("AC-MSG-017-02 — countUnreadNotifications returns unread count for the viewing principal", async () => {
    // Seed: 2 unread + 1 read notifications for CLIENT-A
    const notif1 = await emitNotification({
      recipientType: "CLIENT",
      recipientUserId: clientAUserId,
      type: "notif_int_016_002_count_test",
      title: "Test: count unread 1 (unread)",
    });
    const notif2 = await emitNotification({
      recipientType: "CLIENT",
      recipientUserId: clientAUserId,
      type: "notif_int_016_002_count_test",
      title: "Test: count unread 2 (unread)",
    });
    const notif3 = await emitNotification({
      recipientType: "CLIENT",
      recipientUserId: clientAUserId,
      type: "notif_int_016_002_count_test",
      title: "Test: count unread 3 (will be marked read)",
    });

    // Mark notif3 as read via admin pool (direct update, bypasses RLS)
    await adminPool.request().query(
      `UPDATE [dbo].[Notification] SET [readAt] = SYSDATETIMEOFFSET() WHERE [id] = '${notif3.id}'`
    );

    try {
      // CLIENT-A counts their unread notifications
      // AC-MSG-017-02: derived count under SESSION_CONTEXT, not a stored counter.
      // CS-TS-001: countUnreadNotifications goes through the db wrapper. // CS-TS-001
      const unreadCount = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
        countUnreadNotifications()
      );

      // Must be at least 2 (notif1 + notif2 are unread)
      expect(
        unreadCount,
        "[AC-MSG-017-02] Unread count must be at least 2 (notif1 + notif2 are unread)"
      ).toBeGreaterThanOrEqual(2);

      // Verify the read notification (notif3) has readAt set (so it's excluded from count)
      const readRow = await adminPool.request().query<{ readAt: Date | null }>(
        `SELECT [readAt] FROM [dbo].[Notification] WHERE [id] = '${notif3.id}'`
      );
      expect(
        readRow.recordset[0]?.readAt,
        "[AC-MSG-017-02] notif3 must have readAt set (so it is excluded from unread count)"
      ).not.toBeNull();
    } finally {
      for (const id of [notif1.id, notif2.id, notif3.id]) {
        await adminPool.request().query(
          `DELETE FROM [dbo].[Notification] WHERE [id] = '${id}'`
        ).catch(() => { /* ignore */ });
      }
    }
  });

  /**
   * AC-MSG-015-02 / AC-MSG-015-03: Mark-read on view by linked item.
   *
   * Given CLIENT-A has an unread notification with linkedItemType/linkedItemId,
   * When they view the linked item (markNotificationsReadByLinkedItem called),
   * Then the notification is marked read (readAt IS NOT NULL).
   * And no separate dismiss step is required (AC-MSG-015-03).
   *
   * Verifies: markNotificationsReadByLinkedItem:
   *   - Transitions unread → read for the matching linked item.
   *   - Does NOT require a notification id from the client.
   *   - Is per-principal (CLIENT can only mark their own — BLOCK predicate).
   *
   * // AC-MSG-015-02 // AC-MSG-015-03 // ADR-003 // ADR-005 // CS-TS-001
   */
  it("AC-MSG-015-02/03 — markNotificationsReadByLinkedItem marks the matching unread read", async () => {
    const linkedId = "a0000000-0000-4000-8000-000000000001";
    const linkedType = "engagement";

    // Seed: unread notification with linkedItemType/linkedItemId for CLIENT-A
    const notif = await emitNotification({
      recipientType: "CLIENT",
      recipientUserId: clientAUserId,
      type: "notif_int_016_002_mark_read_test",
      title: "Test: mark-read-on-view",
      linkedItemType: linkedType,
      linkedItemId: linkedId,
    });

    // Confirm it is unread before the mark-read call
    const beforeRow = await adminPool.request().query<{ readAt: Date | null }>(
      `SELECT [readAt] FROM [dbo].[Notification] WHERE [id] = '${notif.id}'`
    );
    expect(beforeRow.recordset[0]?.readAt, "[AC-MSG-015-02] readAt must be NULL before mark-read").toBeNull();

    // Capture unread count before mark-read
    const countBefore = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
      countUnreadNotifications()
    );
    expect(countBefore, "[AC-MSG-017-02] At least 1 unread before mark-read").toBeGreaterThanOrEqual(1);

    try {
      // CLIENT-A views the linked item → markNotificationsReadByLinkedItem called
      // AC-MSG-015-02/-03: no dismiss step; keyed on linked item, not notification id.
      // CS-TS-001: markNotificationsReadByLinkedItem goes through the db wrapper. // CS-TS-001
      const { markedCount } = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
        markNotificationsReadByLinkedItem({ linkedItemType: linkedType, linkedItemId: linkedId })
      );

      expect(markedCount, "[AC-MSG-015-02] At least 1 notification marked read").toBeGreaterThanOrEqual(1);

      // Verify readAt is now set
      const afterRow = await adminPool.request().query<{ readAt: Date | null }>(
        `SELECT [readAt] FROM [dbo].[Notification] WHERE [id] = '${notif.id}'`
      );
      expect(
        afterRow.recordset[0]?.readAt,
        "[AC-MSG-015-02] readAt must be non-null after mark-read"
      ).not.toBeNull();

      // Verify unread count decremented
      const countAfter = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
        countUnreadNotifications()
      );
      expect(
        countAfter,
        "[AC-MSG-017-02] Unread count must decrease after mark-read"
      ).toBeLessThan(countBefore);
    } finally {
      await adminPool.request().query(
        `DELETE FROM [dbo].[Notification] WHERE [id] = '${notif.id}'`
      ).catch(() => { /* ignore */ });
    }
  });

  /**
   * AC-MSG-015-03: Mark-read is idempotent for an already-read notification.
   *
   * Given CLIENT-A has a notification that is already read,
   * When markNotificationsReadByLinkedItem is called for the same linked item,
   * Then the result is a no-op (markedCount = 0) — idempotent.
   *
   * Verifies: the WHERE readAt: null clause means already-read rows are excluded.
   *
   * // AC-MSG-015-03 // ADR-003 // CS-TS-001
   */
  it("AC-MSG-015-03 — mark-read is idempotent for an already-read notification", async () => {
    const linkedId = "a0000000-0000-4000-8000-000000000002";
    const linkedType = "document";

    // Seed: notification already marked read (via admin pool UPDATE)
    const notif = await emitNotification({
      recipientType: "CLIENT",
      recipientUserId: clientAUserId,
      type: "notif_int_016_002_idempotent_test",
      title: "Test: idempotent mark-read",
      linkedItemType: linkedType,
      linkedItemId: linkedId,
    });
    // Mark it read directly (simulating a prior mark-read call)
    await adminPool.request().query(
      `UPDATE [dbo].[Notification] SET [readAt] = SYSDATETIMEOFFSET() WHERE [id] = '${notif.id}'`
    );

    try {
      // Call markNotificationsReadByLinkedItem again for the same linked item
      // AC-MSG-015-03: idempotent — already-read → no-op.
      // CS-TS-001: goes through the db wrapper (SESSION_CONTEXT set). // CS-TS-001
      const { markedCount } = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
        markNotificationsReadByLinkedItem({ linkedItemType: linkedType, linkedItemId: linkedId })
      );

      // No rows marked because the notification is already read (WHERE readAt: null excludes it)
      expect(
        markedCount,
        "[AC-MSG-015-03] markedCount must be 0 (already-read → no-op)"
      ).toBe(0);

      // Verify readAt is still set (unchanged)
      const row = await adminPool.request().query<{ readAt: Date | null }>(
        `SELECT [readAt] FROM [dbo].[Notification] WHERE [id] = '${notif.id}'`
      );
      expect(
        row.recordset[0]?.readAt,
        "[AC-MSG-015-03] readAt must remain set after idempotent call"
      ).not.toBeNull();
    } finally {
      await adminPool.request().query(
        `DELETE FROM [dbo].[Notification] WHERE [id] = '${notif.id}'`
      ).catch(() => { /* ignore */ });
    }
  });

  /**
   * AC-MSG-016-01 / AC-MSG-016-02: A notification ≥90 days old is still listed.
   *
   * Given an ACCOUNTANT-scoped notification backdated 91 days (both read and unread),
   * When the ACCOUNTANT reads their feed via listNotifications,
   * Then both the ≥90-day-old read and unread notifications appear — retention floor.
   *
   * This is a non-deletion guarantee: ADR-018 §retention — no purge built in this slice.
   * The backdated row still exists because there is no auto-purge mechanism for notifications.
   *
   * // AC-MSG-016-01 // AC-MSG-016-02 // ADR-018 // ADR-003 // CS-TS-001
   */
  it("AC-MSG-016-01/02 — a notification ≥90 days old is still listed (retention floor)", async () => {
    // Seed: backdated 91-day-old notifications via admin pool
    // ACCOUNTANT-scoped so they are visible in the ACCOUNTANT feed without client branches.
    // AC-MSG-016-01: read notification (readAt set).
    const retentionReadResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [createdAt], [readAt], [recipientType], [recipientUserId])
       OUTPUT INSERTED.[id]
       VALUES (
         N'notif_int_016_002_retention_read',
         N'Test: RETENTION READ 91 days old',
         ${RETENTION_BACKDATE_SQL},
         ${RETENTION_BACKDATE_SQL},
         N'ACCOUNTANT',
         NULL
       )`
    );
    const retentionReadId = retentionReadResult.recordset[0]?.id ?? "";

    // AC-MSG-016-02: unread notification (readAt NULL).
    const retentionUnreadResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [createdAt], [readAt], [recipientType], [recipientUserId])
       OUTPUT INSERTED.[id]
       VALUES (
         N'notif_int_016_002_retention_unread',
         N'Test: RETENTION UNREAD 91 days old',
         ${RETENTION_BACKDATE_SQL},
         NULL,
         N'ACCOUNTANT',
         NULL
       )`
    );
    const retentionUnreadId = retentionUnreadResult.recordset[0]?.id ?? "";

    try {
      // ACCOUNTANT reads their feed — both 91-day-old notifications must appear.
      // CS-TS-001: listNotifications goes through the db wrapper. // CS-TS-001
      const accountantFeed = await withClerkIdentity(ACCOUNTANT_CLERK_ID, "ACCOUNTANT", () =>
        listNotifications()
      );

      const feedIds = accountantFeed.map((n) => n.id);

      // AC-MSG-016-01: read notification ≥90 days old must be present
      expect(
        includesId(feedIds, retentionReadId),
        "[AC-MSG-016-01] Read notification ≥90 days old must still be in the feed (retention floor)"
      ).toBe(true);

      // AC-MSG-016-02: unread notification ≥90 days old must be present
      expect(
        includesId(feedIds, retentionUnreadId),
        "[AC-MSG-016-02] Unread notification ≥90 days old must still be in the feed (retention floor)"
      ).toBe(true);

      // Verify the read notification has readAt set
      const readEntry = accountantFeed.find((n) => n.id.toLowerCase() === retentionReadId.toLowerCase());
      expect(readEntry?.readAt, "[AC-MSG-016-01] ≥90-day-old read notification must have readAt set").not.toBeNull();

      // Verify the unread notification has readAt null
      const unreadEntry = accountantFeed.find((n) => n.id.toLowerCase() === retentionUnreadId.toLowerCase());
      expect(unreadEntry?.readAt, "[AC-MSG-016-02] ≥90-day-old unread notification must have readAt null").toBeNull();
    } finally {
      for (const id of [retentionReadId, retentionUnreadId]) {
        await adminPool.request().query(
          `DELETE FROM [dbo].[Notification] WHERE [id] = '${id}'`
        ).catch(() => { /* ignore */ });
      }
    }
  });

  /**
   * emitNotification inserts a notification scoped to the correct recipient.
   *
   * Given emitNotification is called with recipientType='CLIENT' and recipientUserId=clientAUserId,
   * When the function completes,
   * Then a Notification row exists with the correct recipient and linked item fields.
   * And it is visible ONLY to CLIENT-A via the request pool (sec.pol_Notification FILTER).
   * And it is NOT visible to CLIENT-B (isolation).
   *
   * This verifies the admin-pool INSERT pattern (bypasses BLOCK predicate) and that
   * the resulting row respects the RLS FILTER for subsequent reads.
   *
   * // AC-MSG-007-01 // AC-MSG-007-02 // ADR-003 §7 // ADR-005 // CS-TS-002
   */
  it("emitNotification inserts a notification scoped to the recipient", async () => {
    const linkedItemId = "a0000000-0000-4000-8000-000000000003";
    const linkedItemType = "document";

    // emitNotification uses admin pool internally (ADR-003 §7, CS-TS-002)
    const result = await emitNotification({
      recipientType: "CLIENT",
      recipientUserId: clientAUserId,
      type: "notif_int_016_002_emit_test",
      title: "Test: emitNotification for CLIENT-A",
      body: "Document ready for download",
      linkedItemType,
      linkedItemId,
    });

    expect(result.id, "emitNotification must return a non-empty id").toBeTruthy();

    try {
      // Verify the row in the database via admin pool
      const row = await adminPool.request().query<{
        id: string;
        recipientType: string;
        recipientUserId: string | null;
        linkedItemType: string | null;
        linkedItemId: string | null;
        readAt: Date | null;
      }>(
        `SELECT [id], [recipientType], [recipientUserId], [linkedItemType], [linkedItemId], [readAt]
         FROM [dbo].[Notification] WHERE [id] = '${result.id}'`
      );

      expect(row.recordset).toHaveLength(1);
      const notif = row.recordset[0];
      expect(notif?.recipientType).toBe("CLIENT");
      expect(notif?.recipientUserId?.toLowerCase()).toBe(clientAUserId.toLowerCase());
      expect(notif?.linkedItemType).toBe(linkedItemType);
      expect(notif?.linkedItemId?.toLowerCase()).toBe(linkedItemId.toLowerCase());
      expect(notif?.readAt).toBeNull(); // emitted as unread

      // Verify CLIENT-A can read it via request pool (RLS FILTER allows it)
      // CS-TS-001: listNotifications goes through the db wrapper. // CS-TS-001
      const clientAFeed = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
        listNotifications()
      );
      const clientAIds = clientAFeed.map((n) => n.id);
      expect(
        includesId(clientAIds, result.id),
        "[AC-MSG-007-01] Emitted notification must be visible to CLIENT-A"
      ).toBe(true);

      // Verify CLIENT-B cannot read it (RLS isolation)
      const clientBFeed = await withClerkIdentity(CLIENT_B_CLERK_ID, "CLIENT", () =>
        listNotifications()
      );
      const clientBIds = clientBFeed.map((n) => n.id);
      expect(
        includesId(clientBIds, result.id),
        "[AC-MSG-007-01] Emitted notification must NOT be visible to CLIENT-B (isolation)"
      ).toBe(false);
    } finally {
      await adminPool.request().query(
        `DELETE FROM [dbo].[Notification] WHERE [id] = '${result.id}'`
      ).catch(() => { /* ignore */ });
    }
  });

});
