/**
 * packages/db/src/document-organization.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6).
 *
 * Tests getTopLevelOrganization (EPIC-013 / BRIEF-013 / TASK-013-002):
 *   - Engagements across two taxYears group by year then engagement (AC-FILE-011-01/-02).
 *   - null taxYear engagements appear in the "unspecified" bucket (DECISION-013-D).
 *   - A CLIENT sees only their own engagements (RLS-scoped via sec.pol_Engagement FILTER).
 *   - Year buckets sorted: known years ASC, null bucket last (DECISION-013-D).
 *
 * Acceptance criteria covered:
 *   AC-FILE-011-01: Files are grouped by engagement.
 *   AC-FILE-011-02: Engagements are grouped by taxYear.
 *
 * // ADR-003 // ADR-005 // DECISION-013-D // AC-FILE-011-01 // AC-FILE-011-02
 * // CS-TS-001 // CS-TS-002 // CS-GEN-001 // CS-GEN-003
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { withClerkIdentity } from "./context.js";
import { getTopLevelOrganization } from "./repositories/document-organization.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection pools ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data ────────────────────────────────────────────────────────────────

/**
 * CLIENT-A: owner of engagements in two tax years (2023 + 2024) + one null-taxYear engagement.
 * CLIENT-B: owner of a separate engagement — CLIENT-A must NOT see it.
 */
let clientAClerkId: string;
let clientAUserId: string;
let clientBClerkId: string;
let clientBUserId: string;

/** Engagement IDs for CLIENT-A: taxYear 2023, taxYear 2024, null taxYear */
let engA2023Id: string;
let engA2024Id: string;
let engANullId: string;

/** Engagement for CLIENT-B (CLIENT-A must not see it) */
let engBId: string;

const engagementIds: string[] = [];
const requestIds: string[] = [];
const userIds: string[] = [];
const documentIds: string[] = [];
const folderIds: string[] = [];

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  clientAClerkId = "org_intg_client_a";
  clientBClerkId = "org_intg_client_b";

  // ─── Pre-clean: remove any stale data from prior runs ───────────────────
  async function precleanUser(clerkId: string): Promise<void> {
    const staleResult = await adminPool.request().query<{ id: string }>(
      `SELECT [id] FROM [dbo].[User] WHERE [clerkId] = N'${clerkId}'`
    );
    const staleId = staleResult.recordset[0]?.id;
    if (!staleId) return;
    const staleEngResult = await adminPool.request().query<{ id: string }>(
      `SELECT [id] FROM [dbo].[Engagement] WHERE [clientUserId] = '${staleId}'`
    );
    for (const staleEng of staleEngResult.recordset) {
      const staleDocResult = await adminPool.request().query<{ id: string }>(
        `SELECT [id] FROM [dbo].[Document] WHERE [engagementId] = '${staleEng.id}'`
      );
      for (const staleDoc of staleDocResult.recordset) {
        await adminPool.request().query(
          `DELETE FROM [dbo].[DocumentVersion] WHERE [documentId] = '${staleDoc.id}'`
        ).catch(() => { /* ignore */ });
      }
      await adminPool.request().query(
        `DELETE FROM [dbo].[Document] WHERE [engagementId] = '${staleEng.id}'`
      ).catch(() => { /* ignore */ });
      await adminPool.request().query(
        `DELETE FROM [dbo].[Folder] WHERE [engagementId] = '${staleEng.id}'`
      ).catch(() => { /* ignore */ });
      await adminPool.request().query(
        `DELETE FROM [dbo].[Engagement] WHERE [id] = '${staleEng.id}'`
      ).catch(() => { /* ignore */ });
    }
    // Delete stale engagement requests for this user's emails
    const emailPrefix = clerkId === "org_intg_client_a" ? "org-intg-a" : "org-intg-b";
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [email] LIKE N'${emailPrefix}%@example.com'`
    ).catch(() => { /* ignore */ });
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${staleId}'`
    ).catch(() => { /* ignore */ });
  }

  await precleanUser(clientAClerkId);
  await precleanUser(clientBClerkId);

  // Seed: User A
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clientAClerkId}', N'org-intg-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";
  userIds.push(clientAUserId);

  // Seed: User B
  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clientBClerkId}', N'org-intg-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";
  userIds.push(clientBUserId);

  // Helper to create EngagementRequest + Engagement with a given taxYear
  async function seedEngagement(
    email: string,
    clientUserId: string,
    taxYear: number | null,
  ): Promise<string> {
    const reqResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'OrgIntg', N'Client', N'${email}', N'accepted', SYSDATETIMEOFFSET())`
    );
    const reqId = reqResult.recordset[0]?.id ?? "";
    requestIds.push(reqId);

    const taxYearClause = taxYear !== null ? `${taxYear}` : "NULL";
    const engResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status], [taxYear], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES ('${reqId}', '${clientUserId}', N'New', ${taxYearClause}, SYSDATETIMEOFFSET())`
    );
    const eid = engResult.recordset[0]?.id ?? "";
    engagementIds.push(eid);
    return eid;
  }

  // CLIENT-A: three engagements — taxYear 2023, taxYear 2024, null
  engA2023Id = await seedEngagement("org-intg-a-2023@example.com", clientAUserId, 2023);
  engA2024Id = await seedEngagement("org-intg-a-2024@example.com", clientAUserId, 2024);
  engANullId = await seedEngagement("org-intg-a-null@example.com", clientAUserId, null);

  // CLIENT-B: one engagement (taxYear 2023 — CLIENT-A must not see it)
  engBId = await seedEngagement("org-intg-b-2023@example.com", clientBUserId, 2023);

  // Seed: one active Document for engA2024 (to verify activeDocumentCount)
  const docResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType],
        [sizeBytes], [status], [version], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${engA2024Id}',
       N'engagements/${engA2024Id}/documents/dummy/v1/test.pdf',
       N'test.pdf', N'application/pdf', 5000, N'active', 1, SYSDATETIMEOFFSET()
     )`
  );
  documentIds.push(docResult.recordset[0]?.id ?? "");

  // Seed: one Folder for engA2023 (to verify folderCount)
  const folderResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Folder]
       ([engagementId], [name], [createdBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engA2023Id}', N'Org Intg Folder', N'accountant_org_intg', SYSDATETIMEOFFSET())`
  );
  folderIds.push(folderResult.recordset[0]?.id ?? "");
}, 30000);

afterAll(async () => {
  // Cleanup in reverse dependency order
  for (const did of documentIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${did}'`
    ).catch(() => { /* ignore */ });
  }
  for (const fid of folderIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Folder] WHERE [id] = '${fid}'`
    ).catch(() => { /* ignore */ });
  }
  for (const eid of engagementIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${eid}'`
    ).catch(() => { /* ignore */ });
  }
  for (const rid of requestIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${rid}'`
    ).catch(() => { /* ignore */ });
  }
  for (const uid of userIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${uid}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getTopLevelOrganization — grouping by taxYear + engagement (AC-FILE-011-01/-02)", () => {

  /**
   * [AC-FILE-011-02] Engagements across two taxYears are grouped into year buckets.
   * CLIENT-A has engagements in 2023, 2024, and null (unspecified).
   * // AC-FILE-011-02 // DECISION-013-D // ADR-003 // ADR-005
   */
  it("[AC-FILE-011-02] CLIENT-A sees engagements grouped by taxYear (2023, 2024, null)", async () => {
    const org = await withClerkIdentity(
      clientAClerkId,
      "CLIENT",
      () => getTopLevelOrganization(),
    );

    // CLIENT-A has 3 engagements total
    expect(org.totalEngagements).toBe(3);
    expect(org.years).toHaveLength(3);

    const taxYears = org.years.map((y) => y.taxYear);
    expect(taxYears).toContain(2023);
    expect(taxYears).toContain(2024);
    expect(taxYears).toContain(null); // DECISION-013-D: unspecified bucket
  });

  /**
   * [AC-FILE-011-01] Each year bucket contains the correct engagements.
   * CLIENT-A: one engagement per year.
   * // AC-FILE-011-01 // AC-FILE-011-02 // ADR-003
   */
  it("[AC-FILE-011-01] each taxYear bucket contains CLIENT-A's correct engagement", async () => {
    const org = await withClerkIdentity(
      clientAClerkId,
      "CLIENT",
      () => getTopLevelOrganization(),
    );

    const bucket2023 = org.years.find((y) => y.taxYear === 2023);
    const bucket2024 = org.years.find((y) => y.taxYear === 2024);
    const bucketNull = org.years.find((y) => y.taxYear === null);

    // Each bucket should contain exactly one engagement
    expect(bucket2023?.engagements).toHaveLength(1);
    expect(bucket2024?.engagements).toHaveLength(1);
    expect(bucketNull?.engagements).toHaveLength(1);

    const ids2023 = bucket2023?.engagements.map((e) => e.engagementId.toLowerCase()) ?? [];
    const ids2024 = bucket2024?.engagements.map((e) => e.engagementId.toLowerCase()) ?? [];
    const idsNull = bucketNull?.engagements.map((e) => e.engagementId.toLowerCase()) ?? [];

    expect(ids2023).toContain(engA2023Id.toLowerCase());
    expect(ids2024).toContain(engA2024Id.toLowerCase());
    expect(idsNull).toContain(engANullId.toLowerCase());
  });

  /**
   * [DECISION-013-D] null taxYear bucket appears at the end (after known years).
   * Year sort order: known years ASC (2023, 2024), null last.
   * // DECISION-013-D // AC-FILE-011-02
   */
  it("[DECISION-013-D] null taxYear bucket sorts last (known years ASC, unspecified last)", async () => {
    const org = await withClerkIdentity(
      clientAClerkId,
      "CLIENT",
      () => getTopLevelOrganization(),
    );

    const taxYears = org.years.map((y) => y.taxYear);

    // Last bucket must be null (DECISION-013-D: unspecified always last)
    expect(taxYears[taxYears.length - 1]).toBeNull();

    // Known years before null must be in ascending order
    const knownYears = taxYears.filter((y): y is number => y !== null);
    for (let i = 1; i < knownYears.length; i++) {
      expect(knownYears[i]!).toBeGreaterThan(knownYears[i - 1]!);
    }
  });

  /**
   * [ADR-005][RLS] CLIENT-A does NOT see CLIENT-B's engagement — RLS isolation.
   * sec.pol_Engagement FILTER scopes getTopLevelOrganization to the caller's own engagements.
   * CLIENT-B has one engagement (taxYear 2023) — CLIENT-A must not see it.
   * // ADR-003 // ADR-005 // AC-FILE-011-01/-02
   */
  it("[ADR-005] CLIENT-A does NOT see CLIENT-B's engagement — RLS-scoped", async () => {
    const org = await withClerkIdentity(
      clientAClerkId,
      "CLIENT",
      () => getTopLevelOrganization(),
    );

    // Collect all engagementIds visible to CLIENT-A
    const allVisibleIds = org.years.flatMap((y) =>
      y.engagements.map((e) => e.engagementId.toLowerCase())
    );

    // CLIENT-B's engagement MUST NOT appear (isolation HARD gate)
    expect(allVisibleIds).not.toContain(engBId.toLowerCase());
  });

  /**
   * [ADR-005] CLIENT-B sees only their own engagement.
   * Bidirectional isolation: CLIENT-B's org result does not include CLIENT-A's engagements.
   * // ADR-003 // ADR-005 // AC-FILE-011-01/-02
   */
  it("[ADR-005] CLIENT-B sees only their own engagement — bidirectional isolation", async () => {
    const org = await withClerkIdentity(
      clientBClerkId,
      "CLIENT",
      () => getTopLevelOrganization(),
    );

    expect(org.totalEngagements).toBe(1);

    const allIds = org.years.flatMap((y) =>
      y.engagements.map((e) => e.engagementId.toLowerCase())
    );
    expect(allIds).toContain(engBId.toLowerCase());
    expect(allIds).not.toContain(engA2023Id.toLowerCase());
    expect(allIds).not.toContain(engA2024Id.toLowerCase());
    expect(allIds).not.toContain(engANullId.toLowerCase());
  });

  /**
   * [ADR-003] ACCOUNTANT sees all four seeded engagements.
   * ACCOUNTANT has full visibility (ACCOUNTANT branch in sec.pol_Engagement FILTER).
   * // ADR-003 // ADR-005 // AC-FILE-011-01/-02
   */
  it("[ADR-003] ACCOUNTANT sees all seeded engagements across CLIENT-A and CLIENT-B", async () => {
    const org = await withClerkIdentity(
      "accountant_clerk_org_intg",
      "ACCOUNTANT",
      () => getTopLevelOrganization(),
    );

    const allIds = org.years.flatMap((y) =>
      y.engagements.map((e) => e.engagementId.toLowerCase())
    );

    // Accountant sees all four: engA2023, engA2024, engANull, engB
    expect(allIds).toContain(engA2023Id.toLowerCase());
    expect(allIds).toContain(engA2024Id.toLowerCase());
    expect(allIds).toContain(engANullId.toLowerCase());
    expect(allIds).toContain(engBId.toLowerCase());
  });

  /**
   * [AC-FILE-011-01] activeDocumentCount and folderCount are populated correctly.
   * engA2024 has 1 active document; engA2023 has 1 folder.
   * // AC-FILE-011-01 // DECISION-013-D
   */
  it("[AC-FILE-011-01] engagement entries include activeDocumentCount + folderCount", async () => {
    const org = await withClerkIdentity(
      clientAClerkId,
      "CLIENT",
      () => getTopLevelOrganization(),
    );

    const bucket2023 = org.years.find((y) => y.taxYear === 2023);
    const bucket2024 = org.years.find((y) => y.taxYear === 2024);

    const eng2023 = bucket2023?.engagements.find(
      (e) => e.engagementId.toLowerCase() === engA2023Id.toLowerCase()
    );
    const eng2024 = bucket2024?.engagements.find(
      (e) => e.engagementId.toLowerCase() === engA2024Id.toLowerCase()
    );

    // engA2024 has 1 active document seeded in beforeAll
    expect(eng2024?.activeDocumentCount).toBe(1);
    expect(eng2024?.folderCount).toBe(0);

    // engA2023 has 1 folder seeded in beforeAll
    expect(eng2023?.folderCount).toBe(1);
    expect(eng2023?.activeDocumentCount).toBe(0);
  });

  /**
   * [AC-FILE-011-02] Empty result when caller has no engagements.
   * A hypothetical new user with no engagements should receive years: [], totalEngagements: 0.
   * // AC-FILE-011-02 // ADR-003 // ADR-005
   */
  it("[AC-FILE-011-02] returns empty org when caller has no visible engagements", async () => {
    // Use a clerkId for a user with no engagements
    const org = await withClerkIdentity(
      "org_intg_no_engagement_user",
      "CLIENT",
      () => getTopLevelOrganization(),
    );

    // This caller has no engagements — expect empty result
    expect(org.totalEngagements).toBe(0);
    expect(org.years).toHaveLength(0);
  });

});
