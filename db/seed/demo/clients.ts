/**
 * db/seed/demo/clients.ts — Demo seed: User rows (clients) + EngagementRequests
 *
 * Seeds 9 realistic US-person clients with varied service needs, plus engagement
 * requests in pending / accepted / declined states — so the accountant's inbox
 * looks lived-in for the walkthrough recording.
 *
 * Strategy:
 *   - User MERGE keyed on email (lowercase-normalized, ASCII-only).
 *   - EngagementRequest MERGE keyed on email (one request per prospect).
 *   - EngagementRequestService rows inserted after request rows; duplicate guard
 *     via TRY/CATCH on the composite PK (no MERGE — the composite key must be
 *     looked up by request id, which we retrieve with OUTPUT).
 *
 * clerkId values are stable fake ids prefixed "demo_" — they will never collide
 * with real Clerk user ids (which start "user_"). If a test Clerk environment
 * already has these ids, update the prefix.
 *
 * FK ordering: Service rows must exist before EngagementRequestService rows.
 *   Services are seeded by seedServices() which always runs first.
 *
 * ASCII-only constraint: all string literals in this file are plain ASCII.
 * Called by: db/seed/demo/index.ts
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../../../packages/db/src/admin-connection.js";

const { NVarChar, Request: MssqlRequest } = mssqlPkg;

// ─── Client definitions ────────────────────────────────────────────────────────

interface ClientSeed {
  /** Stable fake Clerk id (demo_ prefix — not a real Clerk id). */
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** Service names that this prospect requested (must match Service.name exactly). */
  serviceNames: string[];
  /** EngagementRequest status. */
  requestStatus: "pending" | "accepted" | "declined";
  declineReason?: string;
  /** Number of days ago the request was submitted (for realistic timestamps). */
  daysAgo: number;
  message?: string;
}

const CLIENTS: ClientSeed[] = [
  // ── Accepted requests (these become Engagements) ──────────────────────────
  {
    clerkId: "demo_usr_margaret_okonkwo",
    email: "margaret.okonkwo@example.com",
    firstName: "Margaret",
    lastName: "Okonkwo",
    phone: "312-555-0142",
    serviceNames: ["Individual Tax Return Preparation", "Tax Planning"],
    requestStatus: "accepted",
    daysAgo: 42,
    message:
      "Hi, I recently moved from Ohio and need help filing in both states this year.",
  },
  {
    clerkId: "demo_usr_rafael_montoya",
    email: "rafael.montoya@example.com",
    firstName: "Rafael",
    lastName: "Montoya",
    phone: "214-555-0287",
    serviceNames: ["Business Tax Return Preparation", "Bookkeeping"],
    requestStatus: "accepted",
    daysAgo: 35,
    message:
      "My LLC had its first full operating year. I need both bookkeeping cleanup and the return.",
  },
  {
    clerkId: "demo_usr_diane_hartwell",
    email: "diane.hartwell@example.com",
    firstName: "Diane",
    lastName: "Hartwell",
    phone: "617-555-0311",
    serviceNames: ["Individual Tax Return Preparation"],
    requestStatus: "accepted",
    daysAgo: 28,
    message: "Referred by a colleague. Just need my 1040 done.",
  },
  {
    clerkId: "demo_usr_james_calloway",
    email: "james.calloway@example.org",
    firstName: "James",
    lastName: "Calloway",
    phone: "404-555-0198",
    serviceNames: ["IRS Correspondence & Audit Support"],
    requestStatus: "accepted",
    daysAgo: 21,
    message:
      "I received an IRS CP2000 notice and am not sure how to respond. Need help urgently.",
  },
  {
    clerkId: "demo_usr_linda_svensson",
    email: "linda.svensson@example.com",
    firstName: "Linda",
    lastName: "Svensson",
    phone: "503-555-0074",
    serviceNames: [
      "Individual Tax Return Preparation",
      "Tax Planning",
      "Bookkeeping",
    ],
    requestStatus: "accepted",
    daysAgo: 14,
    message:
      "I run a small photography studio as a sole prop and need ongoing help.",
  },
  {
    clerkId: "demo_usr_kevin_oduya",
    email: "kevin.oduya@example.org",
    firstName: "Kevin",
    lastName: "Oduya",
    phone: "206-555-0363",
    serviceNames: ["Business Tax Return Preparation"],
    requestStatus: "accepted",
    daysAgo: 10,
    message:
      "S-Corp with three partners. We need our 1120-S filed and some planning advice.",
  },
  // ── Pending requests (sitting in inbox) ──────────────────────────────────
  {
    clerkId: "demo_usr_carol_fitzpatrick",
    email: "carol.fitzpatrick@example.com",
    firstName: "Carol",
    lastName: "Fitzpatrick",
    phone: "720-555-0229",
    serviceNames: ["Individual Tax Return Preparation", "Tax Planning"],
    requestStatus: "pending",
    daysAgo: 3,
    message:
      "I have rental income and some stock sales this year that complicated things.",
  },
  {
    clerkId: "demo_usr_thomas_bergman",
    email: "thomas.bergman@example.com",
    firstName: "Thomas",
    lastName: "Bergman",
    phone: "651-555-0415",
    serviceNames: ["Bookkeeping", "Business Tax Return Preparation"],
    requestStatus: "pending",
    daysAgo: 1,
    message:
      "My bookkeeper just quit and I need someone to take over immediately.",
  },
  // ── Declined request ──────────────────────────────────────────────────────
  {
    clerkId: "demo_usr_priya_nair",
    email: "priya.nair@example.org",
    firstName: "Priya",
    lastName: "Nair",
    phone: "312-555-0582",
    serviceNames: ["Business Tax Return Preparation"],
    requestStatus: "declined",
    declineReason:
      "At capacity for new business clients this filing season. Please check back in the fall.",
    daysAgo: 18,
    message: "C-Corp with about 40 employees. Looking for a new CPA.",
  },
];

// ─── Seed function ─────────────────────────────────────────────────────────────

/**
 * Upserts demo User rows and EngagementRequest rows.
 * Returns a map of email -> { userId, requestId } for use by downstream seeders.
 */
export async function seedClients(): Promise<
  Map<string, { userId: string | null; requestId: string }>
> {
  const pool = await getAdminPool();

  console.warn("[seed/demo/clients] Upserting", CLIENTS.length, "clients...");

  // ── Step 1: Upsert User rows (client accounts) ──────────────────────────────
  for (const c of CLIENTS) {
    const req = new MssqlRequest(pool);
    req.input("clerkId", NVarChar(64), c.clerkId);
    req.input("email", NVarChar(254), c.email);
    await req.query(`
      MERGE [dbo].[User] AS target
      USING (SELECT @clerkId AS [clerkId]) AS source
        ON target.[clerkId] = source.[clerkId]
      WHEN MATCHED THEN
        UPDATE SET
          [email]     = @email,
          [updatedAt] = SYSDATETIMEOFFSET()
      WHEN NOT MATCHED THEN
        INSERT ([clerkId], [email], [role], [updatedAt])
        VALUES (@clerkId, @email, N'CLIENT', SYSDATETIMEOFFSET());
    `);
  }

  // ── Step 2: Upsert EngagementRequest rows ──────────────────────────────────
  // MERGE keyed on email (one request per prospect email).
  // We capture the upserted id via a separate SELECT after MERGE.
  const requestIdByEmail = new Map<string, string>();

  for (const c of CLIENTS) {
    // Compute a realistic timestamp (daysAgo business days back, roughly)
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - c.daysAgo);

    // decidedAt: accepted/declined requests have a decision 1 day after submission
    const decidedAt =
      c.requestStatus === "accepted" || c.requestStatus === "declined"
        ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000)
        : null;

    const req = new MssqlRequest(pool);
    req.input("email", NVarChar(254), c.email);
    req.input("firstName", NVarChar(100), c.firstName);
    req.input("lastName", NVarChar(100), c.lastName);
    req.input("phone", NVarChar(30), c.phone);
    req.input("message", NVarChar(4000), c.message ?? null);
    req.input("status", NVarChar(20), c.requestStatus);
    req.input("declineReason", NVarChar(4000), c.declineReason ?? null);
    req.input("createdAt", mssqlPkg.DateTimeOffset, createdAt);
    req.input("decidedAt", mssqlPkg.DateTimeOffset, decidedAt);

    await req.query(`
      MERGE [dbo].[EngagementRequest] AS target
      USING (SELECT @email AS [email]) AS source
        ON target.[email] = source.[email]
      WHEN MATCHED THEN
        UPDATE SET
          [firstName]     = @firstName,
          [lastName]      = @lastName,
          [phone]         = @phone,
          [message]       = @message,
          [status]        = @status,
          [declineReason] = @declineReason,
          [decidedAt]     = @decidedAt,
          [updatedAt]     = SYSDATETIMEOFFSET()
      WHEN NOT MATCHED THEN
        INSERT ([firstName], [lastName], [email], [phone], [message],
                [status], [declineReason], [decidedAt], [createdAt], [updatedAt])
        VALUES (@firstName, @lastName, @email, @phone, @message,
                @status, @declineReason, @decidedAt, @createdAt, SYSDATETIMEOFFSET());
    `);

    // Fetch the id (needed for FK rows below)
    const idReq = new MssqlRequest(pool);
    idReq.input("email", NVarChar(254), c.email);
    const idResult = await idReq.query<{ id: string }>(
      `SELECT [id] FROM [dbo].[EngagementRequest] WHERE [email] = @email`,
    );
    const row = idResult.recordset[0];
    if (row) {
      requestIdByEmail.set(c.email, row.id);
    }
  }

  // ── Step 3: Upsert EngagementRequestService join rows ───────────────────────
  // Idempotent: INSERT ... WHERE NOT EXISTS on the composite PK.
  for (const c of CLIENTS) {
    const requestId = requestIdByEmail.get(c.email);
    if (!requestId) continue;

    for (const svcName of c.serviceNames) {
      const req = new MssqlRequest(pool);
      req.input("requestId", NVarChar(50), requestId);
      req.input("serviceName", NVarChar(200), svcName);
      await req.query(`
        INSERT INTO [dbo].[EngagementRequestService] ([engagementRequestId], [serviceId])
        SELECT @requestId, s.[id]
        FROM [dbo].[Service] s
        WHERE s.[name] = @serviceName
          AND NOT EXISTS (
            SELECT 1 FROM [dbo].[EngagementRequestService]
            WHERE [engagementRequestId] = @requestId
              AND [serviceId] = s.[id]
          );
      `);
    }
  }

  // ── Step 4: Fetch User ids for the result map ───────────────────────────────
  const result = new Map<string, { userId: string | null; requestId: string }>();

  for (const c of CLIENTS) {
    const requestId = requestIdByEmail.get(c.email);
    if (!requestId) continue;

    const userReq = new MssqlRequest(pool);
    userReq.input("email", NVarChar(254), c.email);
    const userResult = await userReq.query<{ id: string }>(
      `SELECT [id] FROM [dbo].[User] WHERE [email] = @email`,
    );
    const userId = userResult.recordset[0]?.id ?? null;
    result.set(c.email, { userId, requestId });
  }

  console.warn(
    "[seed/demo/clients]",
    CLIENTS.length,
    "clients seeded (",
    CLIENTS.filter((c) => c.requestStatus === "accepted").length,
    "accepted,",
    CLIENTS.filter((c) => c.requestStatus === "pending").length,
    "pending,",
    CLIENTS.filter((c) => c.requestStatus === "declined").length,
    "declined).",
  );

  return result;
}

// ─── Accountant seed ───────────────────────────────────────────────────────────

/**
 * Upserts the demo ACCOUNTANT User row.
 *
 * // DECISION (TASK-009-004): Path (a) chosen — add the ACCOUNTANT User row to the
 * // demo seed pipeline so that the e2e accountant walkthrough has a real backing
 * // identity. The lane manifest (demo-accounts.ts) already references clerkId
 * // "demo_usr_jane_accountant"; this function seeds the corresponding User row.
 * //
 * // CS-GEN-002: additive only — MERGE on clerkId; never drops or truncates.
 * // CS-TS-001: uses the admin pool (getAdminPool) — bypasses RLS for seed writes,
 * //   consistent with all other seed operations in this pipeline.
 * // ADR-005: the ACCOUNTANT role is set SERVER-SIDE from the manifest, never
 * //   client-supplied; the seed row exists to satisfy User FK lookups in admin pages.
 */
export async function seedAccountant(): Promise<void> {
  const pool = await getAdminPool();

  // MERGE keyed on clerkId (stable demo_ prefix — will not collide with real Clerk ids)
  // CS-GEN-002: additive only — UPDATE only non-identifying fields; never DELETE.
  // CS-TS-001: admin pool — bypasses RLS for seed writes (consistent with seedClients).
  const req = new MssqlRequest(pool);
  req.input("clerkId", NVarChar(64), "demo_usr_jane_accountant");
  req.input("email", NVarChar(254), "jane@example-accountant.com");
  await req.query(`
    MERGE [dbo].[User] AS target
    USING (SELECT @clerkId AS [clerkId]) AS source
      ON target.[clerkId] = source.[clerkId]
    WHEN MATCHED THEN
      UPDATE SET
        [email]     = @email,
        [updatedAt] = SYSDATETIMEOFFSET()
    WHEN NOT MATCHED THEN
      INSERT ([clerkId], [email], [role], [updatedAt])
      VALUES (@clerkId, @email, N'ACCOUNTANT', SYSDATETIMEOFFSET());
  `);

  console.warn("[seed/demo/clients] ACCOUNTANT user (demo_usr_jane_accountant) upserted.");
}

// Re-export client metadata so engagements.ts can build a matching list
export { CLIENTS };
export type { ClientSeed };
