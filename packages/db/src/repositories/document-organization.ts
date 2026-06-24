/**
 * packages/db/src/repositories/document-organization.ts
 *
 * Top-level organization read model — groups visible engagements by taxYear then
 * by engagement, providing the navigation substrate for the file browser.
 *
 * AC-FILE-011-01: Files grouped by engagement.
 * AC-FILE-011-02: Engagements grouped by taxYear.
 *   null taxYear → an explicit "unspecified" bucket (DECISION-013-D).
 *
 * Pool strategy (ADR-003 / CS-TS-001):
 *   REQUEST POOL — FILTER-governed. RLS is the access gate.
 *   - CLIENT (owner + participant): sees only their own engagements + documents.
 *   - ACCOUNTANT: sees all engagements + documents.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * DECISION-013-D: null taxYear engagements are grouped into an explicit "unspecified"
 *   bucket (taxYear: null). This keeps the grouping clean for the UI without
 *   silently dropping ungrouped engagements.
 *
 * NOTE: This read model is intentionally lightweight — it provides the grouping
 *   substrate (year → engagement → folder tree handles). The full folder/document tree
 *   is loaded on demand by the action layer using the individual repository calls
 *   (listEngagementFolders, listEngagementDocuments, listDocumentVersions).
 *
 * // ADR-003 // ADR-005 // DECISION-013-D // CS-TS-001 // CS-GEN-003
 */

import { db } from "../client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single engagement entry in the top-level org model.
 *
 * AC-FILE-011-01: Files are grouped by engagement.
 */
export interface OrgEngagementEntry {
  /** Engagement id. */
  engagementId: string;
  /** Null until back-filled at client sign-up (DECISION-A on Engagement). */
  clientUserId: string | null;
  /** Engagement status. */
  status: string;
  /** taxYear from the engagement (null = unspecified — DECISION-013-D). */
  taxYear: number | null;
  /** Number of active documents visible to the caller in this engagement. */
  activeDocumentCount: number;
  /** Number of folders visible to the caller in this engagement. */
  folderCount: number;
}

/**
 * A single taxYear bucket in the top-level org model.
 *
 * AC-FILE-011-02: Engagements are grouped by taxYear.
 * DECISION-013-D: null taxYear → bucket with taxYear: null ("unspecified").
 */
export interface OrgYearBucket {
  /** The taxYear, or null for the "unspecified" bucket (DECISION-013-D). */
  taxYear: number | null;
  /** Engagements in this bucket, sorted by createdAt ASC. */
  engagements: OrgEngagementEntry[];
}

/**
 * The top-level organization read model returned to callers.
 *
 * AC-FILE-011-01: Files grouped by engagement.
 * AC-FILE-011-02: Engagements grouped by taxYear (null = unspecified — DECISION-013-D).
 */
export interface TopLevelOrganization {
  /** Tax-year buckets sorted by taxYear ASC (null bucket last). */
  years: OrgYearBucket[];
  /** Total engagement count across all years (for display / empty-state detection). */
  totalEngagements: number;
}

// ─── Internal row types ────────────────────────────────────────────────────────

type EngagementOrgRow = {
  id: string;
  clientUserId: string | null;
  status: string;
  taxYear: number | null;
  createdAt: Date;
};

type DocumentCountRow = {
  engagementId: string;
  _count: { id: number };
};

type FolderCountRow = {
  engagementId: string;
  _count: { id: number };
};

// ─── Read: getTopLevelOrganization (request pool — RLS-scoped) ────────────────

/**
 * Returns the top-level organization grouping of visible engagements by taxYear.
 *
 * AC-FILE-011-01: Files grouped by engagement.
 * AC-FILE-011-02: Engagements grouped by taxYear (AC-FILE-011-02).
 * DECISION-013-D: Engagements with taxYear = null are grouped into a "null" bucket
 *   (not silently dropped) so the caller can display an "unspecified year" bucket.
 *
 * Uses the REQUEST POOL via the `db` Prisma client (SESSION_CONTEXT-mediated).
 *   - CLIENT sees only their own engagements (FILTER via sec.pol_Engagement).
 *   - ACCOUNTANT sees all engagements.
 *   - Null SESSION_CONTEXT → ZERO engagements (fail-closed, ADR-003 §5).
 *
 * The document + folder counts are derived from additional RLS-scoped queries
 * (sec.pol_Document / sec.pol_Folder — same SESSION_CONTEXT, same scope).
 *
 * Year buckets are sorted: known years ASC, then the null/"unspecified" bucket last.
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * // ADR-003 // ADR-005 // AC-FILE-011-01 // AC-FILE-011-02 // DECISION-013-D // CS-TS-001
 */
export async function getTopLevelOrganization(): Promise<TopLevelOrganization> {
  // Step 1: Load all visible engagements (RLS-scoped via sec.pol_Engagement FILTER).
  //   SESSION_CONTEXT set by the db $extends middleware (ADR-003 §2).
  const engClient = dbAsEngagementClient();
  const engRows = await engClient.engagement.findMany({
    orderBy: { createdAt: "asc" },
  });

  if (engRows.length === 0) {
    return { years: [], totalEngagements: 0 };
  }

  const engagementIds = engRows.map((r) => r.id);

  // Step 2: Load active document counts for visible engagements (RLS-scoped).
  //   sec.pol_Document FILTER limits to the caller's visible documents.
  const docClient = dbAsDocumentClient();
  const docRows = await docClient.document.groupBy({
    by: ["engagementId"],
    where: {
      engagementId: { in: engagementIds },
      status: "active",
    },
    _count: { id: true },
  });

  const docCountMap = new Map<string, number>();
  for (const row of docRows) {
    docCountMap.set(row.engagementId, row._count.id ?? 0);
  }

  // Step 3: Load folder counts for visible engagements (RLS-scoped).
  //   sec.pol_Folder FILTER limits to the caller's visible folders.
  const folderClient = dbAsFolderClient();
  const folderRows = await folderClient.folder.groupBy({
    by: ["engagementId"],
    where: {
      engagementId: { in: engagementIds },
    },
    _count: { id: true },
  });

  const folderCountMap = new Map<string, number>();
  for (const row of folderRows) {
    folderCountMap.set(row.engagementId, row._count.id ?? 0);
  }

  // Step 4: Build OrgEngagementEntry for each engagement.
  const entries: OrgEngagementEntry[] = engRows.map((row) => ({
    engagementId: row.id,
    clientUserId: row.clientUserId,
    status: row.status,
    taxYear: row.taxYear ?? null,
    activeDocumentCount: docCountMap.get(row.id) ?? 0,
    folderCount: folderCountMap.get(row.id) ?? 0,
  }));

  // Step 5: Group by taxYear.
  //   DECISION-013-D: null taxYear → "unspecified" bucket (taxYear: null).
  //   AC-FILE-011-02: engagements grouped by taxYear.
  const bucketMap = new Map<number | null, OrgEngagementEntry[]>();

  for (const entry of entries) {
    const key = entry.taxYear; // null or a number
    if (!bucketMap.has(key)) {
      bucketMap.set(key, []);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    bucketMap.get(key)!.push(entry);
  }

  // Step 6: Sort buckets: known years ASC, null bucket last (DECISION-013-D).
  const sortedYears = [...bucketMap.keys()].sort((a, b) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;  // null sorts last
    if (b === null) return -1; // null sorts last
    return a - b;              // numeric ASC
  });

  const years: OrgYearBucket[] = sortedYears.map((taxYear) => ({
    taxYear,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    engagements: bucketMap.get(taxYear)!,
  }));

  return { years, totalEngagements: engRows.length };
}

// ─── Internal: Prisma cast helpers ────────────────────────────────────────────

function dbAsEngagementClient() {
  return db as unknown as {
    engagement: {
      findMany: (args?: {
        orderBy?: { createdAt: "asc" | "desc" };
      }) => Promise<EngagementOrgRow[]>;
    };
  };
}

function dbAsDocumentClient() {
  return db as unknown as {
    document: {
      groupBy: (args: {
        by: ["engagementId"];
        where?: { engagementId?: { in: string[] }; status?: string };
        _count: { id: true };
      }) => Promise<DocumentCountRow[]>;
    };
  };
}

function dbAsFolderClient() {
  return db as unknown as {
    folder: {
      groupBy: (args: {
        by: ["engagementId"];
        where?: { engagementId?: { in: string[] } };
        _count: { id: true };
      }) => Promise<FolderCountRow[]>;
    };
  };
}
