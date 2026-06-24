/**
 * apps/portal/src/app/engagements/[engagementId]/documents/actions.test.ts
 *
 * Unit tests for the portal client-participant document download server actions.
 *
 * TASK-013-007: Validate fix-forward — download URL mint must emit recordAuthEvent (ADR-019).
 *   Mirror of apps/admin/...documents/actions.test.ts for the portal download surface
 *   (CS-TS-003 mirror discipline).
 *
 * Acceptance criteria tested (per TASK-013-007 task spec):
 *   - [ADR-019] requestDownloadUrlAction success → recordAuthEvent called once,
 *       action=document.download, targetId=documentId, actor from verified session.
 *   - [CS-GEN-001] audit payload contains NO signed URL / filename / PII.
 *   - [ADR-019] unauthorized / rls-filtered download → NO success audit event recorded.
 *   - [ADR-019] requestDownloadUrlForVersionAction success → recordAuthEvent also fires.
 *   - [ADR-003] null identity rejected before any DB or audit call.
 *
 * Security contract (ADR-003, ADR-006, ADR-009, ADR-019, CS-TS-004):
 *   - Non-CLIENT identity (null or ACCOUNTANT) is rejected before any DB access.
 *   - Actor for the ADR-019 audit event comes ONLY from the verified session.
 *   - The signed URL and version storageKey are NEVER included in the audit payload.
 *   - targetId = documentId (parent document) — CS-GEN-001.
 *
 * Strategy:
 *   - No real DB connection — all seam calls are mocked.
 *   - withRequestContext is mocked to call-through the callback so authorizeThenSignDownload fires.
 *   - Mirrors the admin actions.test.ts download describe blocks (CS-TS-003).
 *   - CS-TS-001: verified by not importing raw DB directly.
 *   - CS-TS-002: verified by not importing adminDb/pool.
 *   - CS-TS-003: mirror discipline — test structure mirrors apps/admin download tests.
 *   - CS-TS-004: identity from session cookie — verified by mock structure.
 *   - CS-GEN-001: verified by asserting no signed URL / filename in audit call args.
 *   - CS-GEN-003: cite governing keys in comments.
 *
 * // ADR-003: server-side authority; actor from session only
 * // ADR-006: portal surface only (download mirror path)
 * // ADR-009: authorize-then-sign download pipeline
 * // ADR-019: download audit event emitted on SUCCESS path only
 * // CS-TS-001: request-scoped DB via wrapper
 * // CS-TS-002: no direct pool import
 * // CS-TS-003: mirror discipline — tests mirror apps/admin download tests
 * // CS-TS-004: identity from session cookie only
 * // CS-GEN-001: no PII or signed URL in audit payload
 * // CS-GEN-003: cite governing authority in comments
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockListEngagementDocuments,
  mockListDocumentVersions,
  mockRecordAuthEvent,
  mockWithRequestContext,
  mockAuthorizeThenSignDownload,
  mockGetSignedDownloadUrl,
} = vi.hoisted(() => {
  return {
    mockGetIdentity: vi.fn(),
    mockListEngagementDocuments: vi.fn(),
    mockListDocumentVersions: vi.fn(),
    mockRecordAuthEvent: vi.fn(),
    mockWithRequestContext: vi.fn(),
    mockAuthorizeThenSignDownload: vi.fn(),
    mockGetSignedDownloadUrl: vi.fn(),
  };
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers — server action reads cookie header to build synthetic Request
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => {
      if (key === "cookie") return "mock-cookie=session";
      return null;
    },
  }),
}));

// Mock @tax-portal/auth — return a verified CLIENT identity by default
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

// Mock @tax-portal/db barrel — includes recordAuthEvent (ADR-019)
vi.mock("@tax-portal/db", () => ({
  listEngagementDocuments: mockListEngagementDocuments,
  listDocumentVersions: mockListDocumentVersions,
  recordAuthEvent: mockRecordAuthEvent, // ADR-019
  withRequestContext: mockWithRequestContext,
}));

// Mock the document repository source module directly (not on the barrel — TASK-013-002 constraint)
// CS-TS-003: mirrors the admin test's mock structure for the download path
vi.mock("@tax-portal/db/src/repositories/document.js", () => ({
  authorizeThenSignDownload: mockAuthorizeThenSignDownload, // ADR-009 download path
}));

// Mock @tax-portal/storage — portal download path uses getSignedDownloadUrl for version path
vi.mock("@tax-portal/storage", () => ({
  getStorage: () => ({
    getSignedDownloadUrl: mockGetSignedDownloadUrl, // ADR-009 version download
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  requestDownloadUrlAction,
  requestDownloadUrlForVersionAction,
} from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_portal_013",
  role: "CLIENT" as const,
};

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_portal_013",
  role: "ACCOUNTANT" as const,
};

const ENGAGEMENT_ID = "eng-013-portal-bbbb-cccc-000000000002";
const DOCUMENT_ID = "doc-013-portal-bbbb-cccc-000000000002";
const DOWNLOAD_URL = "http://localhost:10000/devstoreaccount1/dl/portal-test?sas=dltoken";
const VERSION_STORAGE_KEY = `engagements/${ENGAGEMENT_ID}/documents/${DOCUMENT_ID}/v2/report-v2.pdf`;
const VERSION_DOWNLOAD_URL = "http://localhost:10000/devstoreaccount1/dl/portal-v2?sas=v2token";
const EXPIRES_AT = new Date(Date.now() + 300_000);

// ─── Tests: requestDownloadUrlAction — ADR-019 audit emission (portal) ─────────
//
// TASK-013-007: Validate fix-forward — portal download URL mint must emit recordAuthEvent.
// CS-TS-003: these test cases mirror the admin surface tests (mirror discipline).
//
// [ADR-019] Download URL mint is an audited access event.
// [CS-GEN-001] targetId = documentId only; signed URL and filename NEVER in the audit payload.
// [CS-TS-004] Actor from the verified session — never from args.
// [ADR-003] getClientIdentity() called before any DB query.

describe("[ADR-019] [CS-GEN-001] portal: requestDownloadUrlAction — audit emission on download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    mockRecordAuthEvent.mockResolvedValue(undefined);
    // withRequestContext calls the callback — pass-through so authorizeThenSignDownload is invoked
    // CS-TS-003: same pass-through setup as admin test mirror
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => unknown) => cb(),
    );
    // Default: authorized, URL minted
    mockAuthorizeThenSignDownload.mockResolvedValue({
      authorized: true,
      url: DOWNLOAD_URL,
      expiresAt: EXPIRES_AT,
    });
  });

  it("[ADR-019] success path: recordAuthEvent called once with action=document.download, targetId=documentId", async () => {
    // ADR-019: audit fires exactly once on the SUCCESS path.
    // CS-GEN-001: targetId = documentId (NOT the signed URL, NOT the filename).
    // CS-TS-004: actor.clerkUserId from the verified session.
    // CS-TS-003: mirrors admin requestDownloadUrlAction test.
    const result = await requestDownloadUrlAction(DOCUMENT_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    expect(mockRecordAuthEvent).toHaveBeenCalledOnce(); // ADR-019: exactly one audit event
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: CLIENT_IDENTITY.clerkUserId, // CS-TS-004: from verified session
        }),
        action: "document.download",               // ADR-019: correct action name
        targetType: "Document",
        targetId: DOCUMENT_ID,                     // CS-GEN-001: documentId only
        sourceSurface: "portal",                   // ADR-006: portal surface
      }),
    );
  });

  it("[CS-GEN-001] portal: audit payload contains NO signed URL or filename (CS-GEN-001 / ADR-009)", async () => {
    // CS-GEN-001: signed URL is transient and NEVER persisted or logged (ADR-009).
    // CS-TS-003: mirrors admin test for same property.
    await requestDownloadUrlAction(DOCUMENT_ID, ENGAGEMENT_ID);

    expect(mockRecordAuthEvent).toHaveBeenCalledOnce();
    const callArg = mockRecordAuthEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    // targetId must be documentId, NOT the signed URL
    expect(callArg["targetId"]).toBe(DOCUMENT_ID);
    expect(callArg["targetId"]).not.toBe(DOWNLOAD_URL); // CS-GEN-001: signed URL NOT in payload
    // No filename or storageKey field in the audit payload
    expect(callArg).not.toHaveProperty("filename");
    expect(callArg).not.toHaveProperty("storageKey");
  });

  it("[ADR-019] portal: unauthorized / rls-filtered download → NO success audit event recorded", async () => {
    // ADR-019: a refused authorization must NOT record a successful-access event.
    // CS-TS-003: mirrors admin test for same behavior.
    mockAuthorizeThenSignDownload.mockResolvedValue({
      authorized: false,
      reason: "rls-filtered",
    });

    const result = await requestDownloadUrlAction(DOCUMENT_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    expect(mockRecordAuthEvent).not.toHaveBeenCalled(); // ADR-019: NO event on refusal
  });

  it("[ADR-019] portal: not-active refusal → NO success audit event recorded", async () => {
    // ADR-019: 'not-active' (pending/infected) is also a refusal — no audit event.
    mockAuthorizeThenSignDownload.mockResolvedValue({
      authorized: false,
      reason: "not-active",
    });

    const result = await requestDownloadUrlAction(DOCUMENT_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    expect(mockRecordAuthEvent).not.toHaveBeenCalled(); // ADR-019: NO event on refusal
  });

  it("[ADR-003] [CS-TS-004] portal: null identity → action rejected, NO audit event", async () => {
    // ADR-003: identity guard before any DB access.
    // CS-TS-004: actor from verified session — no session means no audit.
    mockGetIdentity.mockResolvedValue(null);

    const result = await requestDownloadUrlAction(DOCUMENT_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    expect(mockAuthorizeThenSignDownload).not.toHaveBeenCalled();
    expect(mockRecordAuthEvent).not.toHaveBeenCalled();
  });

  it("[ADR-003] portal: ACCOUNTANT identity on portal → action rejected (portal is CLIENT-only)", async () => {
    // DECISION-013-005-A: portal download requires CLIENT identity only.
    // ADR-010 redirects ACCOUNTANT sessions, but the guard here still rejects them.
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);

    const result = await requestDownloadUrlAction(DOCUMENT_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    expect(mockRecordAuthEvent).not.toHaveBeenCalled(); // ADR-003: no audit on rejected identity
  });
});

// ─── Tests: requestDownloadUrlForVersionAction — ADR-019 audit emission (portal) ─
//
// TASK-013-007: version download path also emits the audit event on the portal surface.
// CS-TS-003: mirrors the admin surface version-download test.
//
// [ADR-019] Version download URL mint is an audited access event.
// [CS-GEN-001] targetId = parent documentId (NOT the version storageKey or signed URL).

describe("[ADR-019] [CS-GEN-001] portal: requestDownloadUrlForVersionAction — audit emission on version download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    mockRecordAuthEvent.mockResolvedValue(undefined);
    // withRequestContext calls the callback — pass-through
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => unknown) => cb(),
    );
    // Authorize via parent doc succeeds
    mockAuthorizeThenSignDownload.mockResolvedValue({
      authorized: true,
      url: DOWNLOAD_URL,
      expiresAt: EXPIRES_AT,
    });
    // Version storage key sign
    mockGetSignedDownloadUrl.mockResolvedValue({
      url: VERSION_DOWNLOAD_URL,
      expiresAt: EXPIRES_AT,
    });
  });

  it("[ADR-019] portal: version success path → recordAuthEvent with action=document.download, targetId=documentId", async () => {
    // ADR-019: version download audit uses the parent documentId as targetId.
    // CS-GEN-001: version storageKey is NOT in the audit payload.
    // CS-TS-003: mirrors admin requestDownloadUrlForVersionAction test.
    const result = await requestDownloadUrlForVersionAction(
      DOCUMENT_ID, ENGAGEMENT_ID, VERSION_STORAGE_KEY,
    );

    expect(result.success).toBe(true);
    expect(mockRecordAuthEvent).toHaveBeenCalledOnce(); // ADR-019: exactly one audit event
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: CLIENT_IDENTITY.clerkUserId, // CS-TS-004: from verified session
        }),
        action: "document.download",               // ADR-019: consistent action name
        targetType: "Document",
        targetId: DOCUMENT_ID,                     // CS-GEN-001: parent documentId only
        sourceSurface: "portal",                   // ADR-006: portal surface
      }),
    );
  });

  it("[CS-GEN-001] portal: version download audit payload — targetId is documentId, NOT storageKey or signed URL", async () => {
    // CS-GEN-001: neither the version storageKey nor the signed URL may appear in the audit payload.
    // CS-TS-003: mirrors admin version-download test for same property.
    await requestDownloadUrlForVersionAction(DOCUMENT_ID, ENGAGEMENT_ID, VERSION_STORAGE_KEY);

    expect(mockRecordAuthEvent).toHaveBeenCalledOnce();
    const callArg = mockRecordAuthEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg["targetId"]).toBe(DOCUMENT_ID);              // CS-GEN-001: parent documentId
    expect(callArg["targetId"]).not.toBe(VERSION_STORAGE_KEY);  // NOT the version key
    expect(callArg["targetId"]).not.toBe(VERSION_DOWNLOAD_URL); // NOT the signed URL
    expect(callArg).not.toHaveProperty("storageKey");
    expect(callArg).not.toHaveProperty("filename");
  });

  it("[ADR-019] portal: unauthorized version download → NO success audit event recorded", async () => {
    // ADR-019: refused authorization must NOT record a successful-access event.
    mockAuthorizeThenSignDownload.mockResolvedValue({
      authorized: false,
      reason: "rls-filtered",
    });

    const result = await requestDownloadUrlForVersionAction(
      DOCUMENT_ID, ENGAGEMENT_ID, VERSION_STORAGE_KEY,
    );

    expect(result.success).toBe(false);
    expect(mockRecordAuthEvent).not.toHaveBeenCalled(); // ADR-019: NO event on refusal
  });

  it("[ADR-003] portal: null identity → version download rejected, NO audit event", async () => {
    // ADR-003: identity guard before any DB access.
    mockGetIdentity.mockResolvedValue(null);

    const result = await requestDownloadUrlForVersionAction(
      DOCUMENT_ID, ENGAGEMENT_ID, VERSION_STORAGE_KEY,
    );

    expect(result.success).toBe(false);
    expect(mockRecordAuthEvent).not.toHaveBeenCalled();
  });
});
