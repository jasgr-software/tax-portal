/**
 * packages/db/src/onboarding-gate.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, ADR-012)
 * Tests the server-side accessibility gate + request-pool BLOCK-governed signature write
 * for the onboarding slice (EPIC-005 / TASK-005-005).
 *
 * This test file proves:
 *   [AC-ONBD-001-01] resolveOnboarding returns exactly three ordered steps.
 *   [AC-ONBD-001-02] a later step cannot be entered before the letter is signed (server refuses).
 *   [AC-ONBD-001-03] currentStep + remaining derived from signed/unsigned state.
 *   [AC-ONBD-002-01] questionnaire step refused while letterSignedAt is NULL (server-side).
 *   [AC-ONBD-002-02] document-upload step refused while letterSignedAt is NULL (server-side).
 *   [AC-ONBD-002-03] after signing, steps 2/3 become accessible.
 *   [AC-ONBD-002-04] recordLetterSignatureAsClient sets letterSignedAt + evidence + snapshot.
 *   [ADR-005] CLIENT signing their OWN engagement succeeds (rowsAffected = 1).
 *   [ADR-005] CLIENT signing ANOTHER client's engagement is BLOCK-denied (rowsAffected = 0),
 *             admin read-back confirms row unchanged.
 *   [ADR-005] null/anonymous SESSION_CONTEXT signature write is denied (rowsAffected = 0).
 *
 * LOAD-BEARING TEST (TASK-005-005 dispatch — point 1):
 *   The request-pool BLOCK-governed signature write is the central correctness concern.
 *   This file is the tier-3 proof that sec.pol_Engagement's BLOCK predicate governs
 *   recordLetterSignatureAsClient.
 *
 * Connection approach:
 *   Admin pool (DATABASE_URL_ADMIN): seed rows, verify results (RLS-exempt).
 *   Request pool (DATABASE_URL): the CLIENT-owning write path (subject to RLS/BLOCK).
 *   Session context set IN THE SAME BATCH as the UPDATE (proven pattern from
 *   engagement.client-isolation.rls.test.ts L100-122, L286-298).
 *
 * ADR-003 Amendment 1: SESSION_CONTEXT keys set WITHOUT @read_only = 1.
 * ADR-005: BLOCK predicate (BEFORE UPDATE) on sec.pol_Engagement governs writes.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "../../scripts/db-migrate.js";
import { resolveOnboarding, checkStepAccessibility } from "./onboarding.js";
import { recordLetterSignatureAsClient } from "./repositories/engagement.js";
import type { EngagementItem } from "./repositories/engagement.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;
let requestPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data ────────────────────────────────────────────────────────────────

/** Two clients for isolation testing. */
let clientAClerkId: string;
let clientBClerkId: string;
let clientAUserId: string;
let clientBUserId: string;
/** Engagements owned by CLIENT-A and CLIENT-B. */
let clientAEngagementId: string;
let clientBEngagementId: string;
/** EngagementRequests needed for FK. */
let clientARequestId: string;
let clientBRequestId: string;

// Unique prefix to avoid conflicts with other test runs
const PREFIX = `onb_gate_${Date.now()}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build an EngagementItem fixture for pure-function tests (no DB call needed).
 */
function makeEngagementItem(letterSignedAt: Date | null = null): EngagementItem {
  return {
    id: "fixture-engagement-id",
    engagementRequestId: "fixture-request-id",
    clientUserId: "fixture-client-id",
    status: "New",
    letterSignedAt,
    letterSignatureEvidence: letterSignedAt
      ? JSON.stringify({ provider: "mock", signed: true })
      : null,
    letterTemplateSnapshot: letterSignedAt ? "Dear Client, letter content." : null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

/**
 * Attempt a request-pool signature write with the given SESSION_CONTEXT.
 * SESSION_CONTEXT is set in the same batch as the UPDATE.
 * Clears SESSION_CONTEXT for pool hygiene after the attempt.
 */
async function attemptSignatureWrite(
  engagementId: string,
  clerkUserId: string | null,
  role: string | null,
  signatureEvidence: string = JSON.stringify({ provider: "mock", signed: true }),
  templateSnapshot: string = "Test template content.",
): Promise<{ rowsAffected: number; letterSignedAt: Date | null }> {
  const escapedClerkId = clerkUserId ? clerkUserId.replace(/'/g, "''") : "";
  const escapedRole = role ? role.replace(/'/g, "''") : "";
  const escapedEvidence = signatureEvidence.replace(/'/g, "''");
  const escapedSnapshot = templateSnapshot.replace(/'/g, "''");
  const escapedEngId = engagementId.replace(/'/g, "''");

  const setContextSql =
    clerkUserId !== null && role !== null
      ? `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${escapedClerkId}', @read_only = 0;
         EXEC sp_set_session_context @key = N'role', @value = N'${escapedRole}', @read_only = 0;`
      : "";

  const sql = `${setContextSql}
    UPDATE [dbo].[Engagement]
    SET [letterSignedAt] = SYSDATETIMEOFFSET(),
        [letterSignatureEvidence] = N'${escapedEvidence}',
        [letterTemplateSnapshot] = N'${escapedSnapshot}',
        [updatedAt] = SYSDATETIMEOFFSET()
    WHERE [id] = '${escapedEngId}';
    SELECT @@ROWCOUNT AS rowsAffected;
    EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
    EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`;

  const result = await requestPool.request().batch(sql);

  const recordsets = result.recordsets as Array<Array<{ rowsAffected?: number }>>;
  let rowsAffected = 0;
  for (const rs of recordsets) {
    if (rs.length > 0 && rs[0] !== undefined && "rowsAffected" in rs[0]) {
      rowsAffected = rs[0].rowsAffected ?? 0;
      break;
    }
  }

  // Admin read-back: verify actual DB state
  const verify = await adminPool.request().query<{
    letterSignedAt: Date | null;
  }>(
    `SELECT [letterSignedAt]
     FROM [dbo].[Engagement]
     WHERE [id] = '${escapedEngId}'`
  );
  const letterSignedAt = verify.recordset[0]?.letterSignedAt ?? null;

  return { rowsAffected, letterSignedAt };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for onboarding-gate RLS tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for onboarding-gate RLS tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();

  // Unique clerkIds for this test run to avoid collisions
  clientAClerkId = `${PREFIX}_client_a`;
  clientBClerkId = `${PREFIX}_client_b`;

  // Seed USER rows via admin pool
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clientAClerkId}', N'${PREFIX}-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";

  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clientBClerkId}', N'${PREFIX}-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";

  // Seed EngagementRequest rows (needed for FK)
  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Gate', N'ClientA', N'${PREFIX}-req-a@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientARequestId = reqAResult.recordset[0]?.id ?? "";

  const reqBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Gate', N'ClientB', N'${PREFIX}-req-b@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientBRequestId = reqBResult.recordset[0]?.id ?? "";

  // Seed Engagement rows via admin pool (bypasses BLOCK predicate)
  const engAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientARequestId}', '${clientAUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  clientAEngagementId = engAResult.recordset[0]?.id ?? "";

  const engBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientBRequestId}', '${clientBUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  clientBEngagementId = engBResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup in FK order via admin pool
  for (const id of [clientAEngagementId, clientBEngagementId]) {
    if (id) {
      await adminPool.request().query(
        `DELETE FROM [dbo].[Engagement] WHERE [id] = '${id}'`
      ).catch(() => { /* ignore */ });
    }
  }
  for (const id of [clientARequestId, clientBRequestId]) {
    if (id) {
      await adminPool.request().query(
        `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${id}'`
      ).catch(() => { /* ignore */ });
    }
  }
  for (const id of [clientAUserId, clientBUserId]) {
    if (id) {
      await adminPool.request().query(
        `DELETE FROM [dbo].[User] WHERE [id] = '${id}'`
      ).catch(() => { /* ignore */ });
    }
  }
  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Pure-function tests (resolveOnboarding + checkStepAccessibility) ────────

describe("resolveOnboarding — pure function (no DB)", () => {

  it("[AC-ONBD-001-01] returns exactly three steps in fixed order", () => {
    const engagement = makeEngagementItem(null);
    const model = resolveOnboarding(engagement);

    expect(model.steps).toHaveLength(3);
    expect(model.steps[0]?.key).toBe("engagement-letter");
    expect(model.steps[1]?.key).toBe("intake-questionnaire");
    expect(model.steps[2]?.key).toBe("document-upload");
  });

  it("[AC-ONBD-002-01] questionnaire step is accessible:false when letterSignedAt is NULL", () => {
    const engagement = makeEngagementItem(null);
    const model = resolveOnboarding(engagement);

    const step = model.steps.find(s => s.key === "intake-questionnaire");
    expect(step?.accessible).toBe(false);
  });

  it("[AC-ONBD-002-02] document-upload step is accessible:false when letterSignedAt is NULL", () => {
    const engagement = makeEngagementItem(null);
    const model = resolveOnboarding(engagement);

    const step = model.steps.find(s => s.key === "document-upload");
    expect(step?.accessible).toBe(false);
  });

  it("[AC-ONBD-001-01] engagement-letter step is always accessible:true", () => {
    const engagement = makeEngagementItem(null);
    const model = resolveOnboarding(engagement);

    const step = model.steps.find(s => s.key === "engagement-letter");
    expect(step?.accessible).toBe(true);
  });

  it("[AC-ONBD-001-03] unsigned engagement: currentStep = engagement-letter, remaining = 2", () => {
    const engagement = makeEngagementItem(null);
    const model = resolveOnboarding(engagement);

    expect(model.currentStep).toBe("engagement-letter");
    expect(model.remaining).toBe(2);
  });

  it("[AC-ONBD-002-03] signed engagement: questionnaire + document-upload become accessible:true", () => {
    const engagement = makeEngagementItem(new Date("2026-06-18T12:00:00Z"));
    const model = resolveOnboarding(engagement);

    const questionnaireStep = model.steps.find(s => s.key === "intake-questionnaire");
    const uploadStep = model.steps.find(s => s.key === "document-upload");
    expect(questionnaireStep?.accessible).toBe(true);
    expect(uploadStep?.accessible).toBe(true);
  });

  it("[AC-ONBD-001-03] signed engagement: currentStep = intake-questionnaire, remaining = 1", () => {
    const engagement = makeEngagementItem(new Date("2026-06-18T12:00:00Z"));
    const model = resolveOnboarding(engagement);

    expect(model.currentStep).toBe("intake-questionnaire");
    expect(model.remaining).toBe(1);
  });

  it("[AC-ONBD-001-01] letter step done:true after signing, done:false before", () => {
    const unsigned = makeEngagementItem(null);
    const signed = makeEngagementItem(new Date("2026-06-18T12:00:00Z"));

    const unsignedModel = resolveOnboarding(unsigned);
    const signedModel = resolveOnboarding(signed);

    expect(unsignedModel.steps[0]?.done).toBe(false);
    expect(signedModel.steps[0]?.done).toBe(true);
  });

});

describe("checkStepAccessibility — server-side hard gate (pure function, no DB)", () => {

  it("[AC-ONBD-001-02] questionnaire refused when letter unsigned — returns StepRefusal", () => {
    const engagement = makeEngagementItem(null);
    const refusal = checkStepAccessibility(engagement, "intake-questionnaire");

    expect(refusal).toBeDefined();
    expect(refusal?.refused).toBe(true);
    expect(refusal?.reason).toBe("step-locked");
    expect(refusal?.stepKey).toBe("intake-questionnaire");
  });

  it("[AC-ONBD-001-02] document-upload refused when letter unsigned — returns StepRefusal", () => {
    const engagement = makeEngagementItem(null);
    const refusal = checkStepAccessibility(engagement, "document-upload");

    expect(refusal).toBeDefined();
    expect(refusal?.refused).toBe(true);
    expect(refusal?.reason).toBe("step-locked");
    expect(refusal?.stepKey).toBe("document-upload");
  });

  it("[AC-ONBD-002-03] questionnaire accessible after signing — returns undefined (no refusal)", () => {
    const engagement = makeEngagementItem(new Date("2026-06-18T12:00:00Z"));
    const refusal = checkStepAccessibility(engagement, "intake-questionnaire");

    expect(refusal).toBeUndefined();
  });

  it("[AC-ONBD-002-03] document-upload accessible after signing — returns undefined (no refusal)", () => {
    const engagement = makeEngagementItem(new Date("2026-06-18T12:00:00Z"));
    const refusal = checkStepAccessibility(engagement, "document-upload");

    expect(refusal).toBeUndefined();
  });

  it("[AC-ONBD-001-02] engagement-letter always accessible — returns undefined (no refusal)", () => {
    const engagement = makeEngagementItem(null);
    const refusal = checkStepAccessibility(engagement, "engagement-letter");

    expect(refusal).toBeUndefined();
  });

});

// ─── Tier-3 DB tests: request-pool BLOCK-governed signature write ─────────────

describe("recordLetterSignatureAsClient — request pool BLOCK-governed write (real DB)", () => {

  /**
   * [AC-ONBD-002-04][POSITIVE] CLIENT signs their OWN engagement.
   * SESSION_CONTEXT = clientAClerkId + CLIENT → fn_engagement_access CLIENT branch passes
   * → BLOCK allows → UPDATE proceeds → rowsAffected = 1, letterSignedAt set.
   *
   * This is LOAD-BEARING POINT 1 from the dispatch: proves the request-pool + BLOCK path works.
   */
  it("[AC-ONBD-002-04] CLIENT signs their OWN engagement — rowsAffected = 1, letterSignedAt set", async () => {
    const evidence = JSON.stringify({ provider: "mock", engagementId: clientAEngagementId, signedAt: new Date().toISOString() });
    const snapshot = "Dear Client A, This is the engagement letter.";

    const { rowsAffected, letterSignedAt } = await attemptSignatureWrite(
      clientAEngagementId,
      clientAClerkId,
      "CLIENT",
      evidence,
      snapshot,
    );

    expect(rowsAffected).toBe(1);
    expect(letterSignedAt).not.toBeNull(); // set by the DB
  }, 15000);

  /**
   * [ADR-005][NEGATIVE] CLIENT-B attempts to sign CLIENT-A's engagement.
   * SESSION_CONTEXT = clientBClerkId + CLIENT → fn_engagement_access CLIENT branch:
   * EXISTS (User WHERE clerkId='clientBClerkId') ... JOIN Engagement WHERE id = clientAEngagementId
   * clientBUserId ≠ clientAEngagement.clientUserId → EXISTS empty → BLOCK denies → rowsAffected = 0.
   * Admin read-back: letterSignedAt NOT reset (still from test above or NULL).
   *
   * DECISION (TASK-005-005): This test resets the engagement before asserting to have a clean state.
   */
  it("[ADR-005] CLIENT-B signing CLIENT-A's engagement is BLOCK-denied — rowsAffected = 0, data unchanged", async () => {
    // Reset CLIENT-A's engagement letterSignedAt to NULL (admin pool — bypasses BLOCK) to get a clean baseline
    await adminPool.request().query(
      `UPDATE [dbo].[Engagement]
       SET [letterSignedAt] = NULL, [letterSignatureEvidence] = NULL, [letterTemplateSnapshot] = NULL,
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = '${clientAEngagementId}'`
    );

    const evidence = JSON.stringify({ provider: "mock-b", engagementId: clientAEngagementId });
    const { rowsAffected, letterSignedAt } = await attemptSignatureWrite(
      clientAEngagementId,
      clientBClerkId,  // CLIENT-B attempting to sign CLIENT-A's engagement
      "CLIENT",
      evidence,
      "CLIENT-B tampered template.",
    );

    // BLOCK predicate denies the write
    expect(rowsAffected).toBe(0);
    // Admin read-back: letterSignedAt must still be NULL (data unchanged)
    expect(letterSignedAt).toBeNull();
  }, 15000);

  /**
   * [ADR-005][NEGATIVE] Null/anonymous SESSION_CONTEXT signature write is denied.
   * No SESSION_CONTEXT set → predicate returns empty → BLOCK denies → rowsAffected = 0.
   */
  it("[ADR-005] null SESSION_CONTEXT signature write is denied — rowsAffected = 0, data unchanged", async () => {
    // Ensure CLIENT-B's engagement is unsigned first (clean state)
    await adminPool.request().query(
      `UPDATE [dbo].[Engagement]
       SET [letterSignedAt] = NULL, [letterSignatureEvidence] = NULL, [letterTemplateSnapshot] = NULL,
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = '${clientBEngagementId}'`
    );

    const evidence = JSON.stringify({ provider: "anonymous" });
    const { rowsAffected, letterSignedAt } = await attemptSignatureWrite(
      clientBEngagementId,
      null,   // no SESSION_CONTEXT
      null,   // no role
      evidence,
      "Anonymous tampered template.",
    );

    expect(rowsAffected).toBe(0);
    expect(letterSignedAt).toBeNull();
  }, 15000);

});

/**
 * [AC-ONBD-002-03/-04] INTEGRATION: sign CLIENT-B's engagement as CLIENT-B, then
 * verify steps 2/3 become accessible via resolveOnboarding.
 *
 * This test verifies the full sign→unlock cycle at tier-3:
 *   1. recordLetterSignatureAsClient succeeds for the owner.
 *   2. resolveOnboarding on the updated engagement shows steps 2/3 accessible.
 */
describe("sign→unlock integration (DB + read model)", () => {

  it("[AC-ONBD-002-03] after CLIENT-B signs their own engagement, resolveOnboarding shows steps 2/3 accessible", async () => {
    // Ensure clean state: unsigned
    await adminPool.request().query(
      `UPDATE [dbo].[Engagement]
       SET [letterSignedAt] = NULL, [letterSignatureEvidence] = NULL, [letterTemplateSnapshot] = NULL,
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = '${clientBEngagementId}'`
    );

    const evidence = JSON.stringify({ provider: "mock", engagementId: clientBEngagementId });
    const snapshot = "Dear Client B, engagement letter content.";

    const { rowsAffected } = await attemptSignatureWrite(
      clientBEngagementId,
      clientBClerkId,
      "CLIENT",
      evidence,
      snapshot,
    );

    expect(rowsAffected).toBe(1);

    // Read back the engagement from the DB via admin pool
    const readResult = await adminPool.request().query<{
      id: string;
      engagementRequestId: string;
      clientUserId: string;
      status: string;
      letterSignedAt: Date | null;
      letterSignatureEvidence: string | null;
      letterTemplateSnapshot: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT [id], [engagementRequestId], [clientUserId], [status],
              [letterSignedAt], [letterSignatureEvidence], [letterTemplateSnapshot],
              [createdAt], [updatedAt]
       FROM [dbo].[Engagement]
       WHERE [id] = '${clientBEngagementId}'`
    );

    const row = readResult.recordset[0];
    expect(row).toBeDefined();

    if (!row) return;

    // Build EngagementItem from DB row
    const engagement: EngagementItem = {
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

    expect(engagement.letterSignedAt).not.toBeNull();
    expect(engagement.letterSignatureEvidence).toBe(evidence);
    expect(engagement.letterTemplateSnapshot).toBe(snapshot);

    // Resolve the read model — steps 2/3 should now be accessible
    const model = resolveOnboarding(engagement);

    expect(model.steps[0]?.done).toBe(true);
    expect(model.steps[1]?.accessible).toBe(true); // AC-ONBD-002-03
    expect(model.steps[2]?.accessible).toBe(true); // AC-ONBD-002-03
    expect(model.currentStep).toBe("intake-questionnaire");
  }, 15000);

});

/**
 * Verify that recordLetterSignatureAsClient (the exported function from repositories)
 * also correctly routes to the request pool and exercises the BLOCK predicate.
 *
 * This validates the public API used by signEngagementLetterAction.
 */
describe("recordLetterSignatureAsClient export — request-pool path via public API", () => {

  it("[AC-ONBD-002-04] recordLetterSignatureAsClient public API — CLIENT-A signs own engagement, rowsAffected = 1", async () => {
    // Reset CLIENT-A's engagement to unsigned
    await adminPool.request().query(
      `UPDATE [dbo].[Engagement]
       SET [letterSignedAt] = NULL, [letterSignatureEvidence] = NULL, [letterTemplateSnapshot] = NULL,
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = '${clientAEngagementId}'`
    );

    const result = await recordLetterSignatureAsClient({
      engagementId: clientAEngagementId,
      signatureEvidence: JSON.stringify({ provider: "mock", test: "public-api" }),
      templateSnapshot: "Template via public API test.",
      clerkUserId: clientAClerkId,
      role: "CLIENT",
    });

    expect(result.rowsAffected).toBe(1);

    // Admin read-back: letterSignedAt is set
    const verify = await adminPool.request().query<{ letterSignedAt: Date | null }>(
      `SELECT [letterSignedAt] FROM [dbo].[Engagement] WHERE [id] = '${clientAEngagementId}'`
    );
    expect(verify.recordset[0]?.letterSignedAt).not.toBeNull();
  }, 15000);

  it("[ADR-005] recordLetterSignatureAsClient public API — non-owner CLIENT is BLOCK-denied, rowsAffected = 0", async () => {
    // Reset CLIENT-A engagement again
    await adminPool.request().query(
      `UPDATE [dbo].[Engagement]
       SET [letterSignedAt] = NULL, [letterSignatureEvidence] = NULL, [letterTemplateSnapshot] = NULL,
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = '${clientAEngagementId}'`
    );

    const result = await recordLetterSignatureAsClient({
      engagementId: clientAEngagementId,
      signatureEvidence: JSON.stringify({ provider: "mock-b", test: "non-owner" }),
      templateSnapshot: "Non-owner tamper attempt.",
      clerkUserId: clientBClerkId,  // CLIENT-B attempting CLIENT-A's engagement
      role: "CLIENT",
    });

    expect(result.rowsAffected).toBe(0);

    // Admin read-back: letterSignedAt is still NULL
    const verify = await adminPool.request().query<{ letterSignedAt: Date | null }>(
      `SELECT [letterSignedAt] FROM [dbo].[Engagement] WHERE [id] = '${clientAEngagementId}'`
    );
    expect(verify.recordset[0]?.letterSignedAt).toBeNull();
  }, 15000);

});
