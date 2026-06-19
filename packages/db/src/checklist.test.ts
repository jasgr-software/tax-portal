/**
 * packages/db/src/checklist.test.ts
 *
 * TIER-2/3 INTEGRATION TEST — requires real SQL Server
 * Tests resolveChecklist() and the document-upload step done flag in resolveOnboarding().
 *
 * AC-FILE-008-01: Each engagement has a checklist of document requests.
 * AC-FILE-008-02: Checklist shows outstanding vs. fulfilled.
 * AC-FILE-008-03: Item is fulfilled when ≥1 active Document references it.
 * AC-ONBD-004-02: Step is satisfied when all required items are provided.
 * AC-ONBD-004-04: Zero DocumentRequests → vacuously satisfied (done: true).
 *
 * Coverage:
 *   1. outstanding → fulfilled transition (when an active Document is added)
 *   2. allRequiredProvided = true only when all items are fulfilled
 *   3. Zero-requests case → allRequiredProvided = true (vacuously satisfied, AC-ONBD-004-04)
 *   4. resolveOnboarding document-upload done flag wired from allRequiredProvided (TASK-007-004)
 *   5. FILTER-governed: CLIENT sees own engagement's checklist; CLIENT-B sees ZERO
 *   6. Non-active Document (pending/infected) does NOT count as fulfilled
 *
 * Environment (from .env.local via vitest.setup.ts globalSetup):
 *   DATABASE_URL_ADMIN  — admin pool (RLS-exempt)
 *   DATABASE_URL        — request pool (subject to RLS)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { withClerkIdentity } from "./context.js";
import { resolveChecklist } from "./checklist.js";
import { resolveOnboarding } from "./onboarding.js";
import type { EngagementItem } from "./repositories/engagement.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data ────────────────────────────────────────────────────────────────

let clientAClerkId: string;
let clientAUserId: string;
let clientARequestId: string;
let clientAEngagementId: string;

let clientBClerkId: string;
let clientBUserId: string;
let clientBRequestId: string;
let clientBEngagementId: string;

// DocumentRequest IDs seeded per test scenario
let drAId: string;   // DocumentRequest in engagement A
let drA2Id: string;  // Second DocumentRequest in engagement A (for multi-item tests)

// Document IDs (cleanup tracked here)
const docIdsToClean: string[] = [];

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for checklist integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for checklist integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  clientAClerkId = `checklist_client_a_${Date.now()}`;
  clientBClerkId = `checklist_client_b_${Date.now()}`;

  // CLIENT-A
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clientAClerkId}', N'${clientAClerkId}@test.example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";

  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Checklist', N'ClientA', N'${clientAClerkId}@req.example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientARequestId = reqAResult.recordset[0]?.id ?? "";

  const engAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [letterSignedAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientARequestId}', '${clientAUserId}', N'New',
             SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`
  );
  clientAEngagementId = engAResult.recordset[0]?.id ?? "";

  // CLIENT-B (for isolation test)
  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clientBClerkId}', N'${clientBClerkId}@test.example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";

  const reqBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Checklist', N'ClientB', N'${clientBClerkId}@req.example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientBRequestId = reqBResult.recordset[0]?.id ?? "";

  const engBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientBRequestId}', '${clientBUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  clientBEngagementId = engBResult.recordset[0]?.id ?? "";

  // Seed DocumentRequests for engagement A (2 requests for multi-item tests)
  const drAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentRequest]
       ([engagementId], [label], [createdBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientAEngagementId}', N'Please upload your W-2', N'${clientAClerkId}', SYSDATETIMEOFFSET())`
  );
  drAId = drAResult.recordset[0]?.id ?? "";

  const drA2Result = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentRequest]
       ([engagementId], [label], [createdBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientAEngagementId}', N'Please upload your 1099', N'${clientAClerkId}', SYSDATETIMEOFFSET())`
  );
  drA2Id = drA2Result.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup: Documents → DocumentRequests → Engagements → Requests → Users
  if (docIdsToClean.length > 0) {
    const ids = docIdsToClean.map((id) => `'${id}'`).join(", ");
    await adminPool.request().query(`DELETE FROM [dbo].[Document] WHERE [id] IN (${ids})`).catch(() => {});
  }
  await adminPool.request().query(
    `DELETE FROM [dbo].[Document] WHERE [engagementId] IN ('${clientAEngagementId}', '${clientBEngagementId}')`
  ).catch(() => {});
  await adminPool.request().query(
    `DELETE FROM [dbo].[DocumentRequest] WHERE [id] IN ('${drAId}', '${drA2Id}')`
  ).catch(() => {});
  await adminPool.request().query(
    `DELETE FROM [dbo].[DocumentRequest] WHERE [engagementId] IN ('${clientAEngagementId}', '${clientBEngagementId}')`
  ).catch(() => {});
  await adminPool.request().query(
    `DELETE FROM [dbo].[Engagement] WHERE [id] IN ('${clientAEngagementId}', '${clientBEngagementId}')`
  ).catch(() => {});
  await adminPool.request().query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [id] IN ('${clientARequestId}', '${clientBRequestId}')`
  ).catch(() => {});
  await adminPool.request().query(
    `DELETE FROM [dbo].[User] WHERE [id] IN ('${clientAUserId}', '${clientBUserId}')`
  ).catch(() => {});
  await adminPool.close().catch(() => {});
}, 30000);

// ─── Helper: seed a Document row ─────────────────────────────────────────────

async function seedDocument(opts: {
  engagementId: string;
  documentRequestId?: string | null;
  status: "pending" | "active" | "infected";
  filename?: string;
}): Promise<string> {
  const fname = opts.filename ?? `test-${Date.now()}.pdf`;
  const result = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [documentRequestId], [storageKey], [originalFilename],
        [contentType], [sizeBytes], [status], [version], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${opts.engagementId}',
       ${opts.documentRequestId ? `'${opts.documentRequestId}'` : "NULL"},
       N'engagements/${opts.engagementId}/documents/test/v1/${fname}',
       N'${fname}',
       N'application/pdf',
       1000,
       N'${opts.status}',
       1,
       SYSDATETIMEOFFSET()
     )`
  );
  const id = result.recordset[0]?.id ?? "";
  docIdsToClean.push(id);
  return id;
}

// ─── Tests: basic checklist read model ───────────────────────────────────────

describe("[AC-FILE-008-01] resolveChecklist — basic read model", () => {

  /**
   * [AC-FILE-008-01] Returns checklist items for engagement A (2 items seeded).
   * CLIENT-A sees their own engagement's DocumentRequests.
   */
  it("[AC-FILE-008-01] CLIENT-A sees 2 outstanding checklist items for their engagement", async () => {
    const checklist = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      resolveChecklist(clientAEngagementId)
    );

    expect(checklist.engagementId).toBe(clientAEngagementId);
    expect(checklist.items.length).toBe(2);
    // Both items are outstanding (no documents uploaded yet)
    for (const item of checklist.items) {
      expect(item.status).toBe("outstanding");
    }
    // allRequiredProvided is false (not all fulfilled)
    expect(checklist.allRequiredProvided).toBe(false);
  });

  /**
   * [AC-FILE-008-02] Labels match the seeded DocumentRequests.
   * DECISION (TASK-007-004): UUID comparison is case-insensitive — SQL Server mssql
   * raw INSERT (OUTPUT INSERTED.[id]) returns UUIDs in uppercase hex; Prisma returns
   * them in lowercase. Compare via toLowerCase() to avoid false mismatches.
   */
  it("[AC-FILE-008-02] Checklist items have correct labels and requestIds", async () => {
    const checklist = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      resolveChecklist(clientAEngagementId)
    );

    const requestIdsLower = checklist.items.map((i) => i.requestId.toLowerCase());
    expect(requestIdsLower).toContain(drAId.toLowerCase());
    expect(requestIdsLower).toContain(drA2Id.toLowerCase());

    const drAItem = checklist.items.find((i) => i.requestId.toLowerCase() === drAId.toLowerCase());
    expect(drAItem?.label).toBe("Please upload your W-2");
    const drA2Item = checklist.items.find((i) => i.requestId.toLowerCase() === drA2Id.toLowerCase());
    expect(drA2Item?.label).toBe("Please upload your 1099");
  });

});

// ─── Tests: outstanding → fulfilled transition ────────────────────────────────

describe("[AC-FILE-008-03] outstanding → fulfilled transition", () => {

  /**
   * [AC-FILE-008-03] A pending Document does NOT fulfill a request.
   */
  it("[AC-FILE-008-03] pending Document does NOT fulfill a DocumentRequest", async () => {
    await seedDocument({
      engagementId: clientAEngagementId,
      documentRequestId: drAId,
      status: "pending",
    });

    const checklist = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      resolveChecklist(clientAEngagementId)
    );

    // DECISION (TASK-007-004): compare requestId case-insensitively (SQL Server raw INSERT returns uppercase; Prisma returns lowercase)
    const drAItem = checklist.items.find((i) => i.requestId.toLowerCase() === drAId.toLowerCase());
    // pending Document does NOT count as fulfilled (AC-FILE-008-03: only active counts)
    expect(drAItem?.status).toBe("outstanding");
    expect(checklist.allRequiredProvided).toBe(false);
  });

  /**
   * [AC-FILE-008-03] An infected Document does NOT fulfill a request.
   */
  it("[AC-FILE-008-03] infected Document does NOT fulfill a DocumentRequest", async () => {
    await seedDocument({
      engagementId: clientAEngagementId,
      documentRequestId: drAId,
      status: "infected",
    });

    const checklist = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      resolveChecklist(clientAEngagementId)
    );

    // DECISION (TASK-007-004): compare requestId case-insensitively (SQL Server raw INSERT returns uppercase; Prisma returns lowercase)
    const drAItem = checklist.items.find((i) => i.requestId.toLowerCase() === drAId.toLowerCase());
    // infected Document does NOT count as fulfilled
    expect(drAItem?.status).toBe("outstanding");
    expect(checklist.allRequiredProvided).toBe(false);
  });

  /**
   * [AC-FILE-008-03][POSITIVE] An active Document fulfills the request it references.
   */
  it("[AC-FILE-008-03] active Document fulfills its DocumentRequest (outstanding → fulfilled)", async () => {
    await seedDocument({
      engagementId: clientAEngagementId,
      documentRequestId: drAId,
      status: "active",
    });

    const checklist = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      resolveChecklist(clientAEngagementId)
    );

    // DECISION (TASK-007-004): compare requestId case-insensitively (SQL Server raw INSERT returns uppercase; Prisma returns lowercase)
    const drAItem = checklist.items.find((i) => i.requestId.toLowerCase() === drAId.toLowerCase());
    // active Document → fulfilled (AC-FILE-008-03)
    expect(drAItem?.status).toBe("fulfilled");
    // drA2Id is still outstanding (no active doc for it yet)
    const drA2Item = checklist.items.find((i) => i.requestId.toLowerCase() === drA2Id.toLowerCase());
    expect(drA2Item?.status).toBe("outstanding");
    // Not all required provided yet (drA2 still outstanding)
    expect(checklist.allRequiredProvided).toBe(false);
  });

  /**
   * [AC-ONBD-004-02] allRequiredProvided = true when ALL items are fulfilled.
   */
  it("[AC-ONBD-004-02] allRequiredProvided = true only when all items fulfilled", async () => {
    // Fulfill drA2Id as well
    await seedDocument({
      engagementId: clientAEngagementId,
      documentRequestId: drA2Id,
      status: "active",
    });

    const checklist = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      resolveChecklist(clientAEngagementId)
    );

    // Both items should now be fulfilled
    for (const item of checklist.items) {
      expect(item.status).toBe("fulfilled");
    }
    // allRequiredProvided is now true (AC-ONBD-004-02)
    expect(checklist.allRequiredProvided).toBe(true);
  });

});

// ─── Tests: zero-requests vacuously satisfied (AC-ONBD-004-04) ───────────────

describe("[AC-ONBD-004-04] Zero DocumentRequests → vacuously satisfied", () => {

  let emptyEngagementId: string;
  let emptyEngRequestId: string;
  let emptyClerkId: string;
  let emptyUserId: string;

  beforeAll(async () => {
    emptyClerkId = `checklist_empty_${Date.now()}`;

    const userResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'${emptyClerkId}', N'${emptyClerkId}@test.example.com', N'CLIENT', SYSDATETIMEOFFSET())`
    );
    emptyUserId = userResult.recordset[0]?.id ?? "";

    const reqResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'Empty', N'Engagement', N'${emptyClerkId}@req.example.com', N'accepted', SYSDATETIMEOFFSET())`
    );
    emptyEngRequestId = reqResult.recordset[0]?.id ?? "";

    const engResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status], [letterSignedAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES ('${emptyEngRequestId}', '${emptyUserId}', N'New',
               SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`
    );
    emptyEngagementId = engResult.recordset[0]?.id ?? "";
  }, 15000);

  afterAll(async () => {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${emptyEngagementId}'`
    ).catch(() => {});
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${emptyEngRequestId}'`
    ).catch(() => {});
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${emptyUserId}'`
    ).catch(() => {});
  }, 15000);

  /**
   * [AC-ONBD-004-04] Zero DocumentRequests → allRequiredProvided = true (vacuously satisfied).
   * DECISION (TASK-007-003): all DocumentRequests are required in v1; zero = vacuously done.
   */
  it("[AC-ONBD-004-04] zero DocumentRequests → allRequiredProvided = true (vacuously satisfied)", async () => {
    const checklist = await withClerkIdentity(emptyClerkId, "CLIENT", () =>
      resolveChecklist(emptyEngagementId)
    );

    // No DocumentRequests exist for this engagement
    expect(checklist.items).toHaveLength(0);
    // Zero requests → vacuously satisfied (AC-ONBD-004-04)
    expect(checklist.allRequiredProvided).toBe(true);
  });

  /**
   * [AC-ONBD-004-04] resolveOnboarding document-upload step done = true when vacuously satisfied.
   * The done flag is passed from allRequiredProvided into resolveOnboarding.
   */
  it("[AC-ONBD-004-04] resolveOnboarding: document-upload done=true when zero requests (vacuously satisfied)", async () => {
    const checklist = await withClerkIdentity(emptyClerkId, "CLIENT", () =>
      resolveChecklist(emptyEngagementId)
    );

    // Build a mock EngagementItem to test resolveOnboarding wiring
    const mockEngagement: EngagementItem = {
      id: emptyEngagementId,
      engagementRequestId: emptyEngRequestId,
      clientUserId: emptyUserId,
      status: "New",
      letterSignedAt: new Date(), // signed — upload step accessible
      letterSignatureEvidence: "{}",
      letterTemplateSnapshot: "Template content",
      questionnaireSubmittedAt: new Date(), // questionnaire done
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const onboarding = resolveOnboarding(mockEngagement, checklist.allRequiredProvided);

    const uploadStep = onboarding.steps.find((s) => s.key === "document-upload");
    // Vacuously satisfied → done = true (AC-ONBD-004-04)
    expect(uploadStep?.done).toBe(true);
    expect(uploadStep?.accessible).toBe(true); // letterSignedAt is set
  });

});

// ─── Tests: resolveOnboarding done flag wiring (AC-ONBD-004-04) ──────────────

describe("[AC-ONBD-004-04] resolveOnboarding document-upload done flag wiring", () => {

  /**
   * [AC-ONBD-004-04] document-upload done=false when allRequiredProvided=false.
   */
  it("[AC-ONBD-004-04] document-upload done=false when allRequiredProvided=false", () => {
    const mockEngagement: EngagementItem = {
      id: clientAEngagementId,
      engagementRequestId: clientARequestId,
      clientUserId: clientAUserId,
      status: "New",
      letterSignedAt: new Date(),
      letterSignatureEvidence: "{}",
      letterTemplateSnapshot: "Template",
      questionnaireSubmittedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const onboarding = resolveOnboarding(mockEngagement, false);
    const uploadStep = onboarding.steps.find((s) => s.key === "document-upload");
    expect(uploadStep?.done).toBe(false);
  });

  /**
   * [AC-ONBD-004-04] document-upload done=true when allRequiredProvided=true.
   */
  it("[AC-ONBD-004-04] document-upload done=true when allRequiredProvided=true", () => {
    const mockEngagement: EngagementItem = {
      id: clientAEngagementId,
      engagementRequestId: clientARequestId,
      clientUserId: clientAUserId,
      status: "New",
      letterSignedAt: new Date(),
      letterSignatureEvidence: "{}",
      letterTemplateSnapshot: "Template",
      questionnaireSubmittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const onboarding = resolveOnboarding(mockEngagement, true);
    const uploadStep = onboarding.steps.find((s) => s.key === "document-upload");
    expect(uploadStep?.done).toBe(true);
  });

  /**
   * [AC-ONBD-002-02] document-upload accessible=false when letterSignedAt is NULL.
   * The EPIC-005 letter gate must NOT be weakened by this task.
   */
  it("[AC-ONBD-002-02] document-upload accessible=false when letterSignedAt is NULL (letter gate preserved)", () => {
    const mockEngagement: EngagementItem = {
      id: clientAEngagementId,
      engagementRequestId: clientARequestId,
      clientUserId: clientAUserId,
      status: "New",
      letterSignedAt: null,  // unsigned — letter gate still closed
      letterSignatureEvidence: null,
      letterTemplateSnapshot: null,
      questionnaireSubmittedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const onboarding = resolveOnboarding(mockEngagement, true); // even if vacuously satisfied
    const uploadStep = onboarding.steps.find((s) => s.key === "document-upload");
    // accessible must still be false — letter gate NOT weakened
    expect(uploadStep?.accessible).toBe(false);
    // done=true is possible (vacuously) but accessible=false takes precedence for server-side gate
    // (checkStepAccessibility returns refused when accessible=false)
  });

  /**
   * [AC-ONBD-004-04] allRequiredProvided=undefined → done defaults to false (conservative).
   * Ensures callers that don't pass the checklist result get a safe default.
   */
  it("[AC-ONBD-004-04] resolveOnboarding(engagement) without allRequiredProvided → done=false (safe default)", () => {
    const mockEngagement: EngagementItem = {
      id: clientAEngagementId,
      engagementRequestId: clientARequestId,
      clientUserId: clientAUserId,
      status: "New",
      letterSignedAt: new Date(),
      letterSignatureEvidence: "{}",
      letterTemplateSnapshot: "Template",
      questionnaireSubmittedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Called without the second arg (allRequiredProvided=undefined)
    const onboarding = resolveOnboarding(mockEngagement);
    const uploadStep = onboarding.steps.find((s) => s.key === "document-upload");
    // Conservative default: done=false when not provided
    expect(uploadStep?.done).toBe(false);
  });

});

// ─── Tests: FILTER isolation ──────────────────────────────────────────────────

describe("[AC-FILE-001-05] resolveChecklist — FILTER isolation (CLIENT sees own engagement only)", () => {

  /**
   * CLIENT-B sees ZERO items for CLIENT-A's engagement.
   */
  it("[AC-FILE-001-05] CLIENT-B sees empty checklist for CLIENT-A's engagement (FILTER blocks)", async () => {
    const checklist = await withClerkIdentity(clientBClerkId, "CLIENT", () =>
      resolveChecklist(clientAEngagementId)
    );

    // CLIENT-B's FILTER → no DocumentRequests visible for CLIENT-A's engagement
    expect(checklist.items).toHaveLength(0);
    // Zero items → vacuously satisfied (but CLIENT-B shouldn't be checking this)
    expect(checklist.allRequiredProvided).toBe(true);
  });

  /**
   * Null SESSION_CONTEXT → fail-closed (throws, not silent empty).
   * ADR-003 §6: the Prisma $extends middleware throws when no identity is set in SESSION_CONTEXT.
   * This is by design — fail-closed means the request is REJECTED, not silently filtered.
   * DECISION (TASK-007-004): The test checks for a throw (ADR-003 behaviour), NOT an empty result.
   * The RLS FILTER predicate is the data-plane gate; the Prisma middleware is the code-plane gate.
   */
  it("[ADR-003] null SESSION_CONTEXT → throws (fail-closed — ADR-003 §6 middleware gate)", async () => {
    // Calling without withClerkIdentity → no SESSION_CONTEXT → Prisma middleware throws
    await expect(resolveChecklist(clientAEngagementId)).rejects.toThrow(
      /No identity in request context/
    );
  });

});
