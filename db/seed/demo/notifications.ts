/**
 * db/seed/demo/notifications.ts — Demo seed: Notification rows
 *
 * Seeds a handful of realistic accountant notifications so the notification feed
 * is populated in the walkthrough recording.
 *
 * Notification types seeded (matching the schema's type discriminator values):
 *   'new_engagement_request' — existing type from EPIC-003 (AC-MSG-013-01)
 *   'onboarding_complete'    — engagement gate completion (EPIC-008)
 *
 * Idempotent: INSERT WHERE NOT EXISTS on (type, engagementRequestId) for
 *   request-linked notifications, and (type, body) for standalone ones.
 *   Re-running is safe.
 *
 * readAt: older notifications are marked read; the two most recent are unread
 *   so the unread badge shows up in the walkthrough.
 *
 * ASCII-only constraint: all strings are plain ASCII.
 * Called by: db/seed/demo/index.ts
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../../../packages/db/src/admin-connection.js";

const { NVarChar, DateTimeOffset, Request: MssqlRequest } = mssqlPkg;

// ─── Notification definitions ─────────────────────────────────────────────────

interface NotificationSeed {
  type: string;
  title: string;
  body: string | null;
  /** Email of the client whose request links to this notification (nullable). */
  requestClientEmail: string | null;
  /** Days ago this notification was created. */
  daysAgo: number;
  /** Whether the accountant has already read this notification. */
  read: boolean;
}

const NOTIFICATIONS: NotificationSeed[] = [
  // ── Older read notifications ────────────────────────────────────────────────
  {
    type: "new_engagement_request",
    title: "New engagement request from Margaret Okonkwo",
    body: "Margaret Okonkwo has submitted a request for Individual Tax Return Preparation and Tax Planning.",
    requestClientEmail: "margaret.okonkwo@example.com",
    daysAgo: 42,
    read: true,
  },
  {
    type: "new_engagement_request",
    title: "New engagement request from Rafael Montoya",
    body: "Rafael Montoya has submitted a request for Business Tax Return Preparation and Bookkeeping.",
    requestClientEmail: "rafael.montoya@example.com",
    daysAgo: 35,
    read: true,
  },
  {
    type: "new_engagement_request",
    title: "New engagement request from Diane Hartwell",
    body: "Diane Hartwell has submitted a request for Individual Tax Return Preparation.",
    requestClientEmail: "diane.hartwell@example.com",
    daysAgo: 28,
    read: true,
  },
  {
    type: "onboarding_complete",
    title: "Margaret Okonkwo has completed onboarding",
    body:
      "Margaret Okonkwo has signed the engagement letter, submitted the intake questionnaire, " +
      "and uploaded all required documents. Her engagement is ready to move to In Progress.",
    requestClientEmail: "margaret.okonkwo@example.com",
    daysAgo: 34,
    read: true,
  },
  {
    type: "new_engagement_request",
    title: "New engagement request from Priya Nair",
    body: "Priya Nair has submitted a request for Business Tax Return Preparation.",
    requestClientEmail: "priya.nair@example.org",
    daysAgo: 18,
    read: true,
  },
  {
    type: "new_engagement_request",
    title: "New engagement request from James Calloway",
    body: "James Calloway has submitted a request for IRS Correspondence and Audit Support.",
    requestClientEmail: "james.calloway@example.org",
    daysAgo: 21,
    read: true,
  },
  {
    type: "onboarding_complete",
    title: "Rafael Montoya has completed onboarding",
    body:
      "Rafael Montoya has signed the engagement letter, submitted the intake questionnaire, " +
      "and uploaded all required documents. His engagement is ready for review.",
    requestClientEmail: "rafael.montoya@example.com",
    daysAgo: 27,
    read: true,
  },
  // ── Recent unread notifications ─────────────────────────────────────────────
  {
    type: "new_engagement_request",
    title: "New engagement request from Carol Fitzpatrick",
    body: "Carol Fitzpatrick has submitted a request for Individual Tax Return Preparation and Tax Planning.",
    requestClientEmail: "carol.fitzpatrick@example.com",
    daysAgo: 3,
    read: false,
  },
  {
    type: "new_engagement_request",
    title: "New engagement request from Thomas Bergman",
    body: "Thomas Bergman has submitted a request for Bookkeeping and Business Tax Return Preparation.",
    requestClientEmail: "thomas.bergman@example.com",
    daysAgo: 1,
    read: false,
  },
];

// ─── Seed function ─────────────────────────────────────────────────────────────

/**
 * Upserts demo Notification rows.
 * Idempotent on (type, title) — safe to re-run.
 */
export async function seedNotifications(
  requestIdByEmail: Map<string, { userId: string | null; requestId: string }>,
): Promise<void> {
  const pool = await getAdminPool();

  console.warn(
    "[seed/demo/notifications] Upserting",
    NOTIFICATIONS.length,
    "notifications...",
  );

  for (const n of NOTIFICATIONS) {
    const engagementRequestId = n.requestClientEmail
      ? (requestIdByEmail.get(n.requestClientEmail)?.requestId ?? null)
      : null;

    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - n.daysAgo);

    const readAt = n.read
      ? new Date(createdAt.getTime() + 2 * 60 * 60 * 1000) // read 2 hours later
      : null;

    const req = new MssqlRequest(pool);
    req.input("type", NVarChar(50), n.type);
    req.input("title", NVarChar(200), n.title);
    req.input("body", NVarChar(mssqlPkg.MAX), n.body ?? null);
    req.input(
      "engagementRequestId",
      NVarChar(50),
      engagementRequestId ?? null,
    );
    req.input("readAt", DateTimeOffset, readAt);
    req.input("createdAt", DateTimeOffset, createdAt);

    // Idempotent on title (stable enough for demo seed)
    await req.query(`
      IF NOT EXISTS (
        SELECT 1 FROM [dbo].[Notification] WHERE [title] = @title
      )
      INSERT INTO [dbo].[Notification]
        ([type], [title], [body], [readAt], [engagementRequestId], [createdAt])
      VALUES
        (@type, @title, @body, @readAt, @engagementRequestId, @createdAt);
    `);
  }

  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length;
  console.warn(
    `[seed/demo/notifications] Done. ${NOTIFICATIONS.length} notifications seeded (${unreadCount} unread).`,
  );
}
