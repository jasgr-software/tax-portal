/**
 * packages/db/src/questionnaire.persistence.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012)
 * Tests the QuestionnaireTemplate + QuestionnaireAnswer persistence layer.
 *
 * Tests (tagged with AC IDs):
 *   [AC-DASH-012-02] Template upsert binds to a serviceId; one-per-service uniqueness enforced
 *   [AC-ONBD-003-02] At most one template per service type (uniqueness constraint)
 *   [AC-ONBD-003-04] submitQuestionnaireAnswer records answers + sets Engagement.questionnaireSubmittedAt
 *   [AC-ONBD-003-03] Step satisfaction: questionnaireSubmittedAt non-null after submit
 *
 * Not testing client-isolation here — that is the RLS test file.
 * Not testing request-pool BLOCK path here — that is the isolation test file.
 *
 * Pool: admin pool for all persistence writes (bypasses BLOCK predicates).
 * The upsertTemplateForService / submitQuestionnaireAnswer functions use the admin pool directly.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import {
  upsertTemplateForService,
  getTemplateForService,
  listTemplates,
} from "./repositories/questionnaire-template.js";
import { submitQuestionnaireAnswer } from "./repositories/questionnaire-answer.js";

const { ConnectionPool } = mssqlPkg;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test data ────────────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;
let testServiceAId: string;
let testServiceBId: string;
let testRequestId: string;
let testEngagementId: string;
let testUserId: string;
/** IDs created during tests (for cleanup) */
const createdTemplateIds: string[] = [];
const createdAnswerIds: string[] = [];

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for persistence integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Seed two services for persistence tests
  const svcAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Service] ([name], [active], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Persist Test Service A', 1, SYSDATETIMEOFFSET())`
  );
  testServiceAId = svcAResult.recordset[0]?.id ?? "";

  const svcBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Service] ([name], [active], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Persist Test Service B', 1, SYSDATETIMEOFFSET())`
  );
  testServiceBId = svcBResult.recordset[0]?.id ?? "";

  // Seed a User + EngagementRequest + Engagement for the answer persistence test
  const userResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'persist_test_client', N'persist-test-client@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  testUserId = userResult.recordset[0]?.id ?? "";

  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Persist', N'TestClient', N'persist-test-req@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  testRequestId = reqResult.recordset[0]?.id ?? "";

  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${testRequestId}', '${testUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  testEngagementId = engResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup in reverse dependency order (FK constraints)
  for (const id of createdAnswerIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[QuestionnaireAnswer] WHERE [id] = '${id}'`
    ).catch(() => { /* ignore */ });
  }
  for (const id of createdTemplateIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[QuestionnaireTemplate] WHERE [id] = '${id}'`
    ).catch(() => { /* ignore */ });
  }
  if (testEngagementId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${testEngagementId}'`
    ).catch(() => { /* ignore */ });
  }
  if (testRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${testRequestId}'`
    ).catch(() => { /* ignore */ });
  }
  if (testUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${testUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (testServiceAId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Service] WHERE [id] = '${testServiceAId}'`
    ).catch(() => { /* ignore */ });
  }
  if (testServiceBId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Service] WHERE [id] = '${testServiceBId}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("QuestionnaireTemplate — persistence (tier-3 integration)", () => {

  /**
   * [AC-DASH-012-02][AC-ONBD-003-02] Template upsert creates a new template bound to serviceId.
   * Verifies that upsertTemplateForService correctly creates a new template.
   */
  it("[AC-DASH-012-02] upsertTemplateForService creates a new template bound to serviceId", async () => {
    const questions = JSON.stringify([
      { id: "q1", prompt: "What is your filing status?", type: "text", required: true },
    ]);

    const result = await upsertTemplateForService({
      serviceId: testServiceAId,
      questions,
      accountantClerkId: "accountant_persist_test",
    });

    expect(result.action).toBe("created");
    expect(result.rowsAffected).toBe(1);

    // Verify the template exists with the correct binding
    const template = await getTemplateForService(testServiceAId);
    expect(template).not.toBeNull();
    expect(template?.serviceId).toBe(testServiceAId);
    expect(template?.questions).toBe(questions);
    expect(template?.updatedBy).toBe("accountant_persist_test");
    expect(template?.id).toBeDefined();

    if (template?.id) createdTemplateIds.push(template.id);
  });

  /**
   * [AC-DASH-012-03][AC-ONBD-003-02] Second upsert updates (not duplicates) the existing template.
   * Verifies that the at-most-one-per-service invariant is preserved by the upsert pattern.
   * AC-ONBD-003-02: "a distinct questionnaire template for each service type" — updating in place
   * preserves the one-per-service constraint.
   */
  it("[AC-DASH-012-03] upsertTemplateForService updates existing template — no duplicate created", async () => {
    const updatedQuestions = JSON.stringify([
      { id: "q1", prompt: "Updated question", type: "textarea", required: true },
      { id: "q2", prompt: "Additional question", type: "text", required: false },
    ]);

    const result = await upsertTemplateForService({
      serviceId: testServiceAId,
      questions: updatedQuestions,
      accountantClerkId: "accountant_update_test",
    });

    expect(result.action).toBe("updated");
    expect(result.rowsAffected).toBe(1);

    // Verify the template was updated in place
    const template = await getTemplateForService(testServiceAId);
    expect(template?.questions).toBe(updatedQuestions);
    expect(template?.updatedBy).toBe("accountant_update_test");

    // Verify only ONE template exists for this serviceId (no duplicates)
    const allTemplates = await listTemplates();
    const templatesForService = allTemplates.filter((t) => t.serviceId === testServiceAId);
    expect(templatesForService).toHaveLength(1);
  });

  /**
   * [AC-ONBD-003-02] Two different service types can each have their own template.
   * Verifies the one-per-service constraint allows multiple services to each have a template.
   */
  it("[AC-ONBD-003-02] distinct templates can exist for different service types", async () => {
    const questionsB = JSON.stringify([
      { id: "b1", prompt: "Business name?", type: "text", required: true },
    ]);

    const result = await upsertTemplateForService({
      serviceId: testServiceBId,
      questions: questionsB,
      accountantClerkId: "accountant_persist_test",
    });

    expect(result.action).toBe("created");
    expect(result.rowsAffected).toBe(1);

    // Both service types should have their own distinct template
    const templateA = await getTemplateForService(testServiceAId);
    const templateB = await getTemplateForService(testServiceBId);

    expect(templateA).not.toBeNull();
    expect(templateB).not.toBeNull();
    expect(templateA?.id).not.toBe(templateB?.id);
    expect(templateA?.serviceId).toBe(testServiceAId);
    expect(templateB?.serviceId).toBe(testServiceBId);

    if (templateB?.id) createdTemplateIds.push(templateB.id);
  });

  /**
   * [AC-DASH-012-02] getTemplateForService returns null for a service with no template.
   */
  it("[AC-DASH-012-02] getTemplateForService returns null for service with no template", async () => {
    // Use a non-existent service ID (valid UUID format but not in DB)
    const fakeServiceId = "00000000-0000-0000-0000-000000000099";
    const result = await getTemplateForService(fakeServiceId);
    expect(result).toBeNull();
  });

});

describe("QuestionnaireAnswer — persistence (tier-3 integration)", () => {

  /**
   * [AC-ONBD-003-04][AC-ONBD-003-03] submitQuestionnaireAnswer records answers +
   * sets Engagement.questionnaireSubmittedAt.
   * AC-ONBD-003-04: the answers are recorded against the engagement.
   * AC-ONBD-003-03: the step is satisfied only when the client submits (questionnaireSubmittedAt set).
   */
  it("[AC-ONBD-003-04][AC-ONBD-003-03] submitQuestionnaireAnswer records answers + sets questionnaireSubmittedAt", async () => {
    // Get the template created in the template tests
    const template = await getTemplateForService(testServiceAId);
    expect(template).not.toBeNull();
    const templateId = template!.id;

    const answers = JSON.stringify({ q1: "Married filing jointly" });

    const result = await submitQuestionnaireAnswer({
      engagementId: testEngagementId,
      templateId,
      answers,
    });

    expect(result.rowsAffected).toBe(1);

    // Verify the QuestionnaireAnswer row was created
    const answerResult = await adminPool.request().query<{
      id: string;
      engagementId: string;
      templateId: string;
      answers: string;
      submittedAt: Date;
    }>(
      `SELECT [id], [engagementId], [templateId], [answers], [submittedAt]
       FROM [dbo].[QuestionnaireAnswer]
       WHERE [engagementId] = '${testEngagementId}'`
    );

    expect(answerResult.recordset).toHaveLength(1);
    const row = answerResult.recordset[0];
    expect(row).toBeDefined();
    expect(row?.engagementId).toBe(testEngagementId);
    expect(row?.templateId).toBe(templateId);
    expect(row?.answers).toBe(answers);
    expect(row?.submittedAt).toBeInstanceOf(Date);

    if (row?.id) createdAnswerIds.push(row.id);

    // AC-ONBD-003-03: Verify Engagement.questionnaireSubmittedAt is non-null (step satisfied)
    const engResult = await adminPool.request().query<{
      questionnaireSubmittedAt: Date | null;
    }>(
      `SELECT [questionnaireSubmittedAt]
       FROM [dbo].[Engagement]
       WHERE [id] = '${testEngagementId}'`
    );

    const questionnaireSubmittedAt = engResult.recordset[0]?.questionnaireSubmittedAt;
    expect(questionnaireSubmittedAt).not.toBeNull();
    expect(questionnaireSubmittedAt).toBeInstanceOf(Date);
  });

  /**
   * [AC-ONBD-003-04] One-per-engagement uniqueness: second submit attempt fails (unique constraint).
   * The at-most-one-answer-per-engagement invariant is enforced by the DB UNIQUE constraint.
   */
  it("[AC-ONBD-003-04] one-per-engagement uniqueness: second submit to same engagement is rejected", async () => {
    // Get the template
    const template = await getTemplateForService(testServiceAId);
    const templateId = template!.id;

    const secondAnswers = JSON.stringify({ q1: "Single" });

    // The first submit already happened in the previous test — a second submit must fail
    await expect(
      submitQuestionnaireAnswer({
        engagementId: testEngagementId,
        templateId,
        answers: secondAnswers,
      })
    ).rejects.toThrow(); // UNIQUE constraint violation
  });

});
