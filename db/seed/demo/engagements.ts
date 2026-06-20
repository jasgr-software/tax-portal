/**
 * db/seed/demo/engagements.ts — Demo seed: Engagement rows
 *
 * Creates one Engagement per accepted EngagementRequest, spread across all four
 * lifecycle states (New, In Progress, Review, Complete) with realistic timestamps.
 *
 * Strategy:
 *   - MERGE on engagementRequestId (1:1 UNIQUE key — safe stable merge key).
 *   - Onboarding state columns (letterSignedAt, questionnaireSubmittedAt) are set
 *     on In Progress / Review / Complete rows to reflect progression through the gate.
 *   - clientUserId is back-filled from the User row created in clients.ts — mirrors
 *     the EPIC-004 sign-up back-fill (DECISION-A in schema).
 *
 * Engagement status assignments (6 accepted clients -> 6 engagements):
 *   margaret.okonkwo  -> Complete    (oldest, fully done)
 *   rafael.montoya    -> Review      (in review with accountant)
 *   diane.hartwell    -> In Progress (onboarding complete, work underway)
 *   james.calloway    -> In Progress (IRS audit support, active)
 *   linda.svensson    -> New         (just accepted, onboarding started)
 *   kevin.oduya       -> New         (very recent acceptance)
 *
 * letterSignatureEvidence: a clearly fake but structurally valid JSON string.
 *   PLACEHOLDER — no real Docuseal bytes; see comment at constant definition.
 *
 * ASCII-only constraint: all strings are plain ASCII.
 * Called by: db/seed/demo/index.ts
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../../../packages/db/src/admin-connection.js";

const { NVarChar, Request: MssqlRequest } = mssqlPkg;

// ─── Engagement definitions ────────────────────────────────────────────────────

interface EngagementSeed {
  /** The client email (FK lookup key for engagementRequestId + clientUserId). */
  clientEmail: string;
  status: "New" | "In Progress" | "Review" | "Complete";
  /** Days since the engagement was created (after request was accepted). */
  engagementCreatedDaysAgo: number;
  /** Has the engagement letter been signed? */
  letterSigned: boolean;
  /** Has the questionnaire been submitted? */
  questionnaireDone: boolean;
  /**
   * Snapshot of the letter content captured at sign time (DECISION-C).
   * PLACEHOLDER text — the real content comes from the LetterTemplate; this
   * simulates the snapshot stored at sign time.
   */
  letterSnapshot?: string;
}

// PLACEHOLDER evidence JSON — stored by the mock Docuseal adapter at sign time.
// Not real bytes; clearly labelled as demo placeholder per spec constraint.
const FAKE_SIGNATURE_EVIDENCE =
  '{"provider":"mock","signedAt":"2026-01-15T14:30:00.000Z","submissionId":"demo-placeholder-001","signerEmail":"client@example.com"}';

const LETTER_SNAPSHOT = `Dear Client,

Thank you for choosing our tax services. This engagement letter outlines the terms and scope of the services we will provide.

Scope of Services
We agree to provide the following tax preparation and advisory services:
- Review and preparation of your federal and applicable state income tax returns
- Tax planning advice related to the above returns
- Representation in the event of any inquiries from tax authorities related to the returns we prepare

Client Responsibilities
You agree to:
- Provide complete and accurate information necessary for us to complete your returns
- Notify us promptly of any changes in your financial circumstances
- Review the completed returns before signing and filing

Fees
Our fees will be based on the time required to complete your returns at our standard hourly rates, or as otherwise agreed.

Confidentiality
All information you provide to us will be treated as confidential and will not be disclosed to third parties without your consent, except as required by law.

By signing below, you acknowledge that you have read, understood, and agree to the terms of this engagement letter.

Sincerely,
[Accountant Name]
[Firm Name]`;

export const ENGAGEMENT_SEEDS: EngagementSeed[] = [
  {
    clientEmail: "margaret.okonkwo@example.com",
    status: "Complete",
    engagementCreatedDaysAgo: 40,
    letterSigned: true,
    questionnaireDone: true,
    letterSnapshot: LETTER_SNAPSHOT,
  },
  {
    clientEmail: "rafael.montoya@example.com",
    status: "Review",
    engagementCreatedDaysAgo: 33,
    letterSigned: true,
    questionnaireDone: true,
    letterSnapshot: LETTER_SNAPSHOT,
  },
  {
    clientEmail: "diane.hartwell@example.com",
    status: "In Progress",
    engagementCreatedDaysAgo: 26,
    letterSigned: true,
    questionnaireDone: true,
    letterSnapshot: LETTER_SNAPSHOT,
  },
  {
    clientEmail: "james.calloway@example.org",
    status: "In Progress",
    engagementCreatedDaysAgo: 19,
    letterSigned: true,
    questionnaireDone: false,
    letterSnapshot: LETTER_SNAPSHOT,
  },
  {
    clientEmail: "linda.svensson@example.com",
    status: "New",
    engagementCreatedDaysAgo: 12,
    letterSigned: false,
    questionnaireDone: false,
  },
  {
    clientEmail: "kevin.oduya@example.org",
    status: "New",
    engagementCreatedDaysAgo: 8,
    letterSigned: false,
    questionnaireDone: false,
  },
];

// ─── Seed function ─────────────────────────────────────────────────────────────

/**
 * Upserts Engagement rows for accepted requests.
 * Receives the clientMap from seedClients() to resolve FKs.
 * Returns a map of clientEmail -> engagementId for downstream seeders.
 */
export async function seedEngagements(
  clientMap: Map<string, { userId: string | null; requestId: string }>,
): Promise<Map<string, string>> {
  const pool = await getAdminPool();

  console.warn(
    "[seed/demo/engagements] Upserting",
    ENGAGEMENT_SEEDS.length,
    "engagements...",
  );

  const engagementIdByEmail = new Map<string, string>();

  for (const eng of ENGAGEMENT_SEEDS) {
    const client = clientMap.get(eng.clientEmail);
    if (!client) {
      console.warn(
        `[seed/demo/engagements] WARNING: no client row found for ${eng.clientEmail} — skipping.`,
      );
      continue;
    }

    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - eng.engagementCreatedDaysAgo);

    // Compute onboarding timestamps relative to the engagement creation date
    const letterSignedAt = eng.letterSigned
      ? new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000)
      : null;

    const questionnaireSubmittedAt = eng.questionnaireDone
      ? new Date(createdAt.getTime() + 4 * 24 * 60 * 60 * 1000)
      : null;

    const req = new MssqlRequest(pool);
    req.input("engagementRequestId", NVarChar(50), client.requestId);
    req.input("clientUserId", NVarChar(50), client.userId);
    req.input("status", NVarChar(20), eng.status);
    req.input("letterSignedAt", mssqlPkg.DateTimeOffset, letterSignedAt);
    req.input(
      "letterSignatureEvidence",
      NVarChar(4000),
      eng.letterSigned ? FAKE_SIGNATURE_EVIDENCE : null,
    );
    req.input(
      "letterTemplateSnapshot",
      NVarChar(4000),
      eng.letterSnapshot ?? null,
    );
    req.input(
      "questionnaireSubmittedAt",
      mssqlPkg.DateTimeOffset,
      questionnaireSubmittedAt,
    );
    req.input("createdAt", mssqlPkg.DateTimeOffset, createdAt);

    await req.query(`
      MERGE [dbo].[Engagement] AS target
      USING (SELECT @engagementRequestId AS [engagementRequestId]) AS source
        ON target.[engagementRequestId] = source.[engagementRequestId]
      WHEN MATCHED THEN
        UPDATE SET
          [clientUserId]               = @clientUserId,
          [status]                     = @status,
          [letterSignedAt]             = @letterSignedAt,
          [letterSignatureEvidence]    = @letterSignatureEvidence,
          [letterTemplateSnapshot]     = @letterTemplateSnapshot,
          [questionnaireSubmittedAt]   = @questionnaireSubmittedAt,
          [updatedAt]                  = SYSDATETIMEOFFSET()
      WHEN NOT MATCHED THEN
        INSERT ([engagementRequestId], [clientUserId], [status],
                [letterSignedAt], [letterSignatureEvidence], [letterTemplateSnapshot],
                [questionnaireSubmittedAt], [createdAt], [updatedAt])
        VALUES (@engagementRequestId, @clientUserId, @status,
                @letterSignedAt, @letterSignatureEvidence, @letterTemplateSnapshot,
                @questionnaireSubmittedAt, @createdAt, SYSDATETIMEOFFSET());
    `);

    // Fetch back the engagement id
    const idReq = new MssqlRequest(pool);
    idReq.input("engagementRequestId", NVarChar(50), client.requestId);
    const idResult = await idReq.query<{ id: string }>(
      `SELECT [id] FROM [dbo].[Engagement] WHERE [engagementRequestId] = @engagementRequestId`,
    );
    const row = idResult.recordset[0];
    if (row) {
      engagementIdByEmail.set(eng.clientEmail, row.id);
    }
  }

  console.warn(
    "[seed/demo/engagements] Done. Statuses:",
    ENGAGEMENT_SEEDS.map((e) => `${e.clientEmail.split("@")[0]}=${e.status}`).join(", "),
  );

  return engagementIdByEmail;
}
