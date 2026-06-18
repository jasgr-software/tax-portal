/**
 * packages/db/src/questionnaire-answer.client-isolation.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 * Tests the sec.pol_QuestionnaireAnswer security policy — the SECOND client-owned-rows policy.
 *
 * This is the load-bearing isolation test for EPIC-006 / TASK-006-001.
 * Per ADR-005 §6, a CLIENT-A-cannot-read-CLIENT-B test is a HARD requirement for every
 * new security policy that introduces client-owned rows.
 *
 * ADR-005 §6 minimum coverage per policy (all present below + extra cases):
 *   [AC-ONBD-003-04][POSITIVE]  CLIENT-A reads only their own answers (1 row)
 *   [AC-ONBD-003-04][NEGATIVE]  CLIENT-B sees ZERO rows for CLIENT-A's answers — client isolation
 *   [ADR-005][NEGATIVE]         Anonymous / null SESSION_CONTEXT reads ZERO answers (fail-closed)
 *   [ADR-005][POSITIVE]         ACCOUNTANT role reads all answers (both clients' rows)
 *   [ADR-005][NEGATIVE]         CLIENT cannot UPDATE another client's answers — BLOCK predicate
 *                               → rowsAffected = 0; admin read-back confirms no mutation
 *   [ADR-005][NEGATIVE]         CLIENT cannot INSERT a QuestionnaireTemplate — BLOCK predicate
 *                               (no CLIENT branch in fn_questionnaire_template_write_access)
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — INTRODUCES-GATE: yes):
 *   1. Run marker: this file at packages/db/src/questionnaire-answer.client-isolation.rls.test.ts;
 *      test names (exact):
 *        "[AC-ONBD-003-04] CLIENT-A reads only their own questionnaire answers — positive"
 *        "[AC-ONBD-003-04] CLIENT-B sees ZERO rows for CLIENT-A's answers — client isolation (ADR-005 HARD)"
 *        "[ADR-005] anonymous / null SESSION_CONTEXT reads ZERO questionnaire answers — fail-closed"
 *        "[ADR-005] ACCOUNTANT reads all questionnaire answers — both CLIENT-A and CLIENT-B rows"
 *        "[ADR-005] CLIENT cannot UPDATE another client's questionnaire answers — BLOCK predicate"
 *        "[ADR-005] CLIENT cannot INSERT a QuestionnaireTemplate — BLOCK predicate (no CLIENT branch)"
 *      Actual output recorded in TASK-006-001 Work Log.
 *   2. Named code path: sec.fn_questionnaire_answer_access in db/policies/0006-questionnaire-policy.sql —
 *      specifically the FILTER PREDICATE on dbo.QuestionnaireAnswer (STATE = ON, SCHEMABINDING = ON)
 *      and the BLOCK PREDICATE BEFORE UPDATE on dbo.QuestionnaireAnswer. The CLIENT-ownership branch:
 *        OR EXISTS (
 *          SELECT 1 FROM [dbo].[User] u
 *          JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
 *          WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *            AND e.[id] = @answerEngagementId
 *        )
 *   3. Counterfactual: removing the CLIENT-ownership EXISTS branch from fn_questionnaire_answer_access
 *      would cause "[AC-ONBD-003-04] CLIENT-A reads only their own questionnaire answers — positive"
 *      to return 0 rows instead of 1, failing that test. Alternatively, removing the FILTER PREDICATE
 *      entirely would cause "[AC-ONBD-003-04] CLIENT-B sees ZERO rows" to return 1 row
 *      (CLIENT-B would see CLIENT-A's answer row), failing the isolation test.
 *
 * ADR-003 Amendment 1: SESSION_CONTEXT keys set WITHOUT @read_only (writable keys).
 * No @read_only is introduced anywhere in this test.
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for pool setup/control. Rationale: same as TASK-005-001
 *   (Prisma 5.22.0 sqlserver connector cannot parse port in authority URL form — P1013).
 *   SESSION_CONTEXT is set in the same batch as the SELECT/UPDATE to ensure it is active
 *   when the predicate evaluates it.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (taxportal_admin; IS_MEMBER('app_admin_role')=1 → RLS-exempt)
 *   DATABASE_URL       — request pool URL (taxportal_user; subject to RLS)
 *
 * Tagged AC IDs:
 *   AC-ONBD-003-04 — Client's submitted answers are recorded against the engagement (DB substrate:
 *                    this test verifies the client-isolation policy that makes answers visible to
 *                    the owning client only).
 *   ADR-005 §6     — Hard requirement: CLIENT-A-cannot-read-CLIENT-B integration test for every
 *                    new client-owned-rows security policy (SECOND policy — first is 0005).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;
let requestPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data ────────────────────────────────────────────────────────────────

/** Two test users for CLIENT-A and CLIENT-B isolation testing. */
let clientAUserId: string;
let clientBUserId: string;
/** Engagements owned by CLIENT-A and CLIENT-B. */
let clientAEngagementId: string;
let clientBEngagementId: string;
/** EngagementRequests needed for the 1:1 FK on Engagement. */
let clientARequestId: string;
let clientBRequestId: string;
/** Service for the template FK. */
let testServiceId: string;
/** Template used by both answer rows. */
let testTemplateId: string;
/** CLIENT-A's answer row. */
let clientAAnswerId: string;
/** CLIENT-B's answer row. */
let clientBAnswerId: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Attempt to UPDATE a QuestionnaireAnswer's answers blob via the request pool with a given identity.
 * Returns { rowsAffected, currentAnswers } — used to verify BLOCK predicate behavior.
 *
 * SQL Server BLOCK predicate for BEFORE UPDATE:
 *   Predicate empty → UPDATE silently suppressed → @@ROWCOUNT = 0, no error.
 *   Predicate passes → UPDATE proceeds → @@ROWCOUNT = 1.
 */
async function attemptAnswerUpdate(
  answerId: string,
  engagementId: string,
  clerkUserId: string | null,
  role: string | null,
  newAnswers: string,
): Promise<{ rowsAffected: number; currentAnswers: string }> {
  const setContextSql =
    clerkUserId !== null && role !== null
      ? `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${clerkUserId.replace(/'/g, "''")}', @read_only = 0;
         EXEC sp_set_session_context @key = N'role', @value = N'${role.replace(/'/g, "''")}', @read_only = 0;`
      : "";

  const sql = `${setContextSql}
    UPDATE [dbo].[QuestionnaireAnswer]
    SET [answers] = '${newAnswers.replace(/'/g, "''")}',
        [updatedAt] = SYSDATETIMEOFFSET()
    WHERE [id] = '${answerId}';
    SELECT @@ROWCOUNT AS affected;`;

  const result = await requestPool.request().batch(sql);
  const firstRecordset = (result.recordsets as Array<Array<{ affected?: number }>>)[0];
  const rowsAffected = firstRecordset?.[0]?.affected ?? 0;

  // Clear SESSION_CONTEXT after the attempt (pool hygiene)
  await requestPool.request().batch(
    `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
     EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
  );

  // Admin read-back confirms whether data was mutated (bypasses RLS, IS_MEMBER('app_admin_role')=1)
  const verify = await adminPool.request().query<{ answers: string }>(
    `SELECT [answers] FROM [dbo].[QuestionnaireAnswer] WHERE [id] = '${answerId}'`
  );
  const currentAnswers = verify.recordset[0]?.answers ?? "";

  return { rowsAffected, currentAnswers };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for RLS integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for RLS integration tests");

  // Admin pool — IS_MEMBER('app_admin_role')=1 → RLS-exempt
  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Request pool — app_user_role → subject to RLS
  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();

  // Seed: two User rows (CLIENT-A and CLIENT-B) via admin pool
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'qa_rls_client_a', N'qa-rls-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";

  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'qa_rls_client_b', N'qa-rls-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";

  // Seed: two EngagementRequest rows (needed for the 1:1 FK on Engagement)
  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'QA', N'ClientA', N'qa-rls-req-a@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientARequestId = reqAResult.recordset[0]?.id ?? "";

  const reqBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'QA', N'ClientB', N'qa-rls-req-b@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientBRequestId = reqBResult.recordset[0]?.id ?? "";

  // Seed: two Engagement rows via admin pool (bypasses BLOCK predicate — IS_MEMBER admin branch)
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

  // Seed: a Service (needed as FK for QuestionnaireTemplate)
  const svcResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Service] ([name], [active], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'QA RLS Test Service', 1, SYSDATETIMEOFFSET())`
  );
  testServiceId = svcResult.recordset[0]?.id ?? "";

  // Seed: a QuestionnaireTemplate (needed as FK for QuestionnaireAnswer)
  // Admin pool bypasses BLOCK predicate on QuestionnaireTemplate — IS_MEMBER('app_admin_role')=1.
  const tmplResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[QuestionnaireTemplate]
       ([serviceId], [questions], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${testServiceId}', N'[{"id":"q1","prompt":"Test question","type":"text","required":true}]', SYSDATETIMEOFFSET())`
  );
  testTemplateId = tmplResult.recordset[0]?.id ?? "";

  // Seed: QuestionnaireAnswer rows for CLIENT-A and CLIENT-B (admin pool bypasses BLOCK)
  const ansAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[QuestionnaireAnswer]
       ([engagementId], [templateId], [answers], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientAEngagementId}', '${testTemplateId}', N'{"q1":"Answer from CLIENT-A"}', SYSDATETIMEOFFSET())`
  );
  clientAAnswerId = ansAResult.recordset[0]?.id ?? "";

  const ansBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[QuestionnaireAnswer]
       ([engagementId], [templateId], [answers], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientBEngagementId}', '${testTemplateId}', N'{"q1":"Answer from CLIENT-B"}', SYSDATETIMEOFFSET())`
  );
  clientBAnswerId = ansBResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup via admin pool (bypasses RLS BLOCK predicates) — reverse dependency order
  if (clientAAnswerId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[QuestionnaireAnswer] WHERE [id] = '${clientAAnswerId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientBAnswerId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[QuestionnaireAnswer] WHERE [id] = '${clientBAnswerId}'`
    ).catch(() => { /* ignore */ });
  }
  if (testTemplateId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[QuestionnaireTemplate] WHERE [id] = '${testTemplateId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientAEngagementId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${clientAEngagementId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientBEngagementId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${clientBEngagementId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientARequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${clientARequestId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientBRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${clientBRequestId}'`
    ).catch(() => { /* ignore */ });
  }
  if (testServiceId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Service] WHERE [id] = '${testServiceId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientAUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${clientAUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientBUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${clientBUserId}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("sec.pol_QuestionnaireAnswer — client-isolation RLS (HARD GATE, ADR-005 §6, EPIC-006 SECOND client-owned rows)", () => {

  /**
   * [AC-ONBD-003-04][POSITIVE] CLIENT-A reads their own questionnaire answers.
   * Named code path: fn_questionnaire_answer_access CLIENT-ownership EXISTS branch.
   * CLIENT-A's SESSION_CONTEXT → fn_questionnaire_answer_access EXISTS branch
   *   (clerkId='qa_rls_client_a' → User.id = clientAUserId → Engagement.id = clientAEngagementId)
   * → 1 row returned (CLIENT-A sees their own answer).
   */
  it("[AC-ONBD-003-04] CLIENT-A reads only their own questionnaire answers — positive", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'qa_rls_client_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id], [answers] FROM [dbo].[QuestionnaireAnswer]
       WHERE [engagementId] = '${clientAEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string; answers?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // CLIENT-A MUST see exactly their own answer (EXISTS branch passes for matching engagement)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(clientAAnswerId);
  });

  /**
   * [AC-ONBD-003-04][NEGATIVE] CLIENT-B reads CLIENT-A's answers — ZERO rows (ADR-005 HARD).
   * This is the CLIENT-A-cannot-read-CLIENT-B test (ADR-005 §6 HARD requirement).
   * CLIENT-B's SESSION_CONTEXT → fn_questionnaire_answer_access EXISTS checks
   *   User(clerkId='qa_rls_client_b').id = clientBUserId ≠ clientAEngagementId's clientUserId
   * → EXISTS empty → predicate empty → FILTER removes row → 0 rows.
   */
  it("[AC-ONBD-003-04] CLIENT-B sees ZERO rows for CLIENT-A's answers — client isolation (ADR-005 HARD)", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'qa_rls_client_b', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[QuestionnaireAnswer]
       WHERE [engagementId] = '${clientAEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // CLIENT-B MUST NOT see CLIENT-A's answers (isolation — fail-closed for non-owner)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [ADR-005][NEGATIVE] Null SESSION_CONTEXT reads ZERO rows — fail-closed, no error.
   * ADR-003 §5: null identity → all three branches fail → predicate empty → 0 rows.
   * Both CLIENT-A and CLIENT-B answers should be invisible.
   */
  it("[ADR-005] anonymous / null SESSION_CONTEXT reads ZERO questionnaire answers — fail-closed", async () => {
    // Count without setting any SESSION_CONTEXT (anonymous path)
    const result = await requestPool.request().query(
      `SELECT COUNT(*) AS cnt FROM [dbo].[QuestionnaireAnswer]
       WHERE [id] IN ('${clientAAnswerId}', '${clientBAnswerId}')`
    );

    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    // Null SESSION_CONTEXT → predicate empty → FILTER removes all rows → 0 (fail-closed)
    expect(cnt).toBe(0);
  });

  /**
   * [ADR-005][POSITIVE] ACCOUNTANT role reads all questionnaire answers.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * ACCOUNTANT sees both CLIENT-A and CLIENT-B answer rows.
   */
  it("[ADR-005] ACCOUNTANT reads all questionnaire answers — both CLIENT-A and CLIENT-B rows", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'qa_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[QuestionnaireAnswer]
       WHERE [id] IN ('${clientAAnswerId}', '${clientBAnswerId}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // ACCOUNTANT MUST see both answer rows (ACCOUNTANT branch passes unconditionally)
    expect(selectRecordset).toHaveLength(2);
    const ids = (selectRecordset ?? []).map((r) => r.id);
    expect(ids).toContain(clientAAnswerId);
    expect(ids).toContain(clientBAnswerId);
  });

  /**
   * [ADR-005][NEGATIVE] CLIENT cannot UPDATE another client's questionnaire answers — BLOCK predicate.
   * CLIENT-B attempts to UPDATE CLIENT-A's answer.
   * BLOCK PREDICATE BEFORE UPDATE: fn_questionnaire_answer_access(engagementId) evaluates CLIENT-B's
   * ownership of CLIENT-A's answer → EXISTS empty → BLOCK suppresses → @@ROWCOUNT = 0.
   * Data unchanged — confirmed via admin-pool read-back.
   */
  it("[ADR-005] CLIENT cannot UPDATE another client's questionnaire answers — BLOCK predicate", async () => {
    const originalAnswers = '{"q1":"Answer from CLIENT-A"}';
    const mutatedAnswers = '{"q1":"MUTATED by CLIENT-B"}';

    const result = await attemptAnswerUpdate(
      clientAAnswerId,
      clientAEngagementId,
      "qa_rls_client_b",
      "CLIENT",
      mutatedAnswers,
    );

    // BLOCK predicate silently returns 0 rows affected (SQL Server BEFORE UPDATE behavior)
    expect(result.rowsAffected).toBe(0);
    // Data MUST be unchanged — CLIENT-A's answers are still the original value
    expect(result.currentAnswers).toBe(originalAnswers);
  });

  /**
   * [ADR-005][NEGATIVE] CLIENT cannot INSERT a QuestionnaireTemplate — BLOCK predicate.
   * fn_questionnaire_template_write_access has NO CLIENT branch → fails closed.
   * Mirrors the fn_service_write_access pattern (0002-service-readable.sql).
   * Expected: the INSERT is blocked (error or zero rows affected).
   */
  it("[ADR-005] CLIENT cannot INSERT a QuestionnaireTemplate — BLOCK predicate (no CLIENT branch)", async () => {
    let wasBlocked = false;
    let insertedId: string | null = null;

    try {
      const result = await requestPool.request().batch(
        `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'qa_rls_client_a', @read_only = 0;
         EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
         INSERT INTO [dbo].[QuestionnaireTemplate]
           ([serviceId], [questions], [updatedAt])
         OUTPUT INSERTED.[id]
         VALUES ('${testServiceId}', N'[{"id":"q1","prompt":"Injected","type":"text","required":false}]', SYSDATETIMEOFFSET());`
      );

      // If no error, check if any rows were actually inserted (BLOCK predicate suppresses)
      const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
      const insertRecordset = recordsets[recordsets.length - 1];
      if (insertRecordset && insertRecordset.length > 0) {
        insertedId = insertRecordset[0]?.id ?? null;
      } else {
        wasBlocked = true;
      }
    } catch {
      // BLOCK predicate may raise an error (error 33504 for AFTER INSERT)
      wasBlocked = true;
    } finally {
      // Clear SESSION_CONTEXT regardless of outcome
      await requestPool.request().batch(
        `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
         EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
      ).catch(() => { /* ignore */ });
    }

    // Admin read-back: confirm no rogue template row was inserted with the test serviceId
    // (there should still be exactly one row — the one we seeded in beforeAll)
    const verify = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[QuestionnaireTemplate]
       WHERE [serviceId] = '${testServiceId}'`
    );
    const currentCount = verify.recordset[0]?.cnt ?? -1;

    // If an id was returned, we need to clean it up (should not happen)
    if (insertedId) {
      await adminPool.request().query(
        `DELETE FROM [dbo].[QuestionnaireTemplate] WHERE [id] = '${insertedId}'`
      ).catch(() => { /* ignore */ });
    }

    // BLOCK predicate must have fired (error thrown or 0 rows output)
    // AND the admin read-back must show exactly 1 row (the seeded template, not a new one)
    expect(currentCount).toBe(1);
    // wasBlocked=true (error path) OR insertedId=null (suppression path — no OUTPUT row)
    // Either way the DB state must be unchanged (currentCount = 1)
    expect(wasBlocked || insertedId === null).toBe(true);
  });

});

// ─── Additional sanity tests ──────────────────────────────────────────────────

describe("sec.pol_QuestionnaireAnswer — admin pool sanity check", () => {

  /**
   * [POSITIVE] Admin pool reads both answer rows — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate always passes.
   */
  it("[POSITIVE] Admin pool (app_admin_role) reads both seeded answers — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[QuestionnaireAnswer]
       WHERE [id] IN ('${clientAAnswerId}', '${clientBAnswerId}')`
    );
    const cnt = result.recordset[0]?.cnt ?? 0;
    // Admin pool bypasses RLS → sees both
    expect(cnt).toBe(2);
  });

});
