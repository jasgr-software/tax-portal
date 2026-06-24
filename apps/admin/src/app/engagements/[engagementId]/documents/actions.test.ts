/**
 * apps/admin/src/app/engagements/[engagementId]/documents/actions.test.ts
 *
 * Unit tests for accountant upload + version-replace server actions.
 *
 * TASK-013-003: Accountant upload + version-replace UI & server actions.
 *
 * Acceptance criteria tested:
 *   AC-FILE-001-01 — the accountant can upload a file to an engagement
 *   AC-FILE-009-01 — an existing file can be replaced with a new version
 *   AC-FILE-009-02 — after replacement, the newest version is presented as current
 *
 * Security contract (ADR-003, ADR-006, ADR-019, ADR-022, CS-TS-004):
 *   - Non-ACCOUNTANT identity (null or CLIENT) is rejected by every action BEFORE any DB write.
 *   - Actor for ADR-019 audit event comes ONLY from the verified session — never from action args.
 *   - Rate-limit (ADR-022) is consumed BEFORE authorize on requestUploadUrlAction + replaceWithNewVersionAction.
 *   - Every action calls the TASK-013-002 seam (mocked here) — no duplicate pipeline logic.
 *
 * Strategy:
 *   - No real DB connection — all seam calls are mocked.
 *   - Identity guard tested with null identity, CLIENT role, and valid ACCOUNTANT.
 *   - Rate-limit mock tested: limiter.consume returns { allowed: false } → action refuses.
 *   - Mirrors actions.test.ts pattern from engagement lifecycle (TASK-010-003).
 *   - CS-TS-001: verified by not calling raw DB directly.
 *   - CS-TS-002: verified by not importing adminDb/pool directly.
 *   - CS-TS-004: identity from session cookie — verified by mock structure.
 *   - CS-GEN-001: verified by not logging PII (checked via not including filename in audit calls).
 *   - CS-GEN-003: cite governing keys in comments.
 *
 * // ADR-003: server-side authority; actor from session only
 * // ADR-006: admin surface only
 * // ADR-019: audit event actor comes from verified session
 * // ADR-022: rate-limit before minting upload URL
 * // CS-TS-001: request-scoped DB via wrapper
 * // CS-TS-002: no direct pool import
 * // CS-TS-004: identity from session cookie only
 * // CS-GEN-001: no PII in logs
 * // CS-GEN-003: cite governing authority in comments
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockGetRateLimiter,
  mockLimiterConsume,
  mockAuthorizeAccountantUpload,
  mockInsertPendingDocument,
  mockCompleteUpload,
  mockReplaceDocumentWithNewVersion,
  mockListEngagementDocuments,
  mockListDocumentVersions,
  mockRecordAuthEvent,
  mockWithRequestContext,
  mockGetSignedUploadUrl,
  mockGetSignedDownloadUrl,
  mockAuthorizeThenSignDownload,
  mockRevalidatePath,
} = vi.hoisted(() => {
  const mockLimiterConsume = vi.fn(() => ({ allowed: true }));
  return {
    mockGetIdentity: vi.fn(),
    mockGetRateLimiter: vi.fn(() => ({ consume: mockLimiterConsume })),
    mockLimiterConsume,
    mockAuthorizeAccountantUpload: vi.fn(),
    mockInsertPendingDocument: vi.fn(),
    mockCompleteUpload: vi.fn(),
    mockReplaceDocumentWithNewVersion: vi.fn(),
    mockListEngagementDocuments: vi.fn(),
    mockListDocumentVersions: vi.fn(),
    mockRecordAuthEvent: vi.fn(),
    mockWithRequestContext: vi.fn(),
    mockGetSignedUploadUrl: vi.fn(),
    mockGetSignedDownloadUrl: vi.fn(),
    mockAuthorizeThenSignDownload: vi.fn(),
    mockRevalidatePath: vi.fn(),
  };
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers — server action reads cookie header to build synthetic Request
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => {
      if (key === "cookie") return "mock-cookie=session";
      if (key === "x-forwarded-for") return "127.0.0.1";
      return null;
    },
  }),
}));

// Mock next/cache — revalidatePath is a no-op in tests
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

// Mock @tax-portal/auth — return a verified ACCOUNTANT identity by default
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
  getRateLimiter: mockGetRateLimiter, // ADR-022
  buildRateLimitKey: (ip: string, endpoint: string) => `${ip}:${endpoint}`,
}));

// Mock @tax-portal/db barrel
vi.mock("@tax-portal/db", () => ({
  listEngagementDocuments: mockListEngagementDocuments,
  listDocumentVersions: mockListDocumentVersions,
  recordAuthEvent: mockRecordAuthEvent, // ADR-019
  withRequestContext: mockWithRequestContext,
}));

// Mock the document repository source module directly (not on the barrel — TASK-013-002 constraint)
vi.mock("@tax-portal/db/src/repositories/document.js", () => ({
  authorizeAccountantUpload: mockAuthorizeAccountantUpload, // ADR-009
  insertPendingDocument: mockInsertPendingDocument,         // ADR-009 step 2d
  completeUpload: mockCompleteUpload,                       // ADR-021
  replaceDocumentWithNewVersion: mockReplaceDocumentWithNewVersion, // DECISION-013-C
  authorizeThenSignDownload: mockAuthorizeThenSignDownload, // ADR-009 download path
}));

// Mock @tax-portal/storage
vi.mock("@tax-portal/storage", () => ({
  getStorage: () => ({
    getSignedUploadUrl: mockGetSignedUploadUrl,     // ADR-009 upload
    getSignedDownloadUrl: mockGetSignedDownloadUrl, // ADR-009 version download
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  requestUploadUrlAction,
  completeUploadAction,
  replaceWithNewVersionAction,
  listDocumentsAction,
  requestDownloadUrlAction,
  requestDownloadUrlForVersionAction,
} from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test_013",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test_013",
  role: "CLIENT" as const,
};

const ENGAGEMENT_ID = "eng-013-aaaa-bbbb-cccc-000000000001";
const DOCUMENT_ID = "doc-013-aaaa-bbbb-cccc-000000000001";
const STORAGE_KEY = `engagements/${ENGAGEMENT_ID}/documents/${DOCUMENT_ID}/v1/report.pdf`;
const UPLOAD_URL = "http://localhost:10000/devstoreaccount1/uploads/test?sas=token";
const VERSION_ID = "ver-013-aaaa-bbbb-cccc-000000000002";
const VERSION_STORAGE_KEY = `engagements/${ENGAGEMENT_ID}/documents/${DOCUMENT_ID}/v2/report-v2.pdf`;

const MOCK_ENGAGEMENT = {
  id: ENGAGEMENT_ID,
  engagementRequestId: "req-013-001",
  clientUserId: "user_client_001",
  status: "In Progress",
  letterSignedAt: new Date(),
  letterSignatureEvidence: null,
  letterTemplateSnapshot: null,
  questionnaireSubmittedAt: null,
  deliveryConfirmedAt: null,
  filingConfirmedAt: null,
  taxYear: 2023,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Tests: identity guard — every action rejects non-ACCOUNTANT ──────────────
//
// [AC-FILE-001-01] [AC-FILE-009-01] accountant-only enforcement.
// ADR-003: getAccountantIdentity() must be called BEFORE any DB write.
// CS-TS-004: identity from session cookie only — never from args or form data.

describe("[AC-FILE-001-01] [AC-FILE-009-01] [security] non-ACCOUNTANT identity is rejected by every action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(null);
    mockGetRateLimiter.mockReturnValue({ consume: mockLimiterConsume });
    mockLimiterConsume.mockReturnValue({ allowed: true });
    // Seam mocks should NEVER be called when identity is rejected
    mockAuthorizeAccountantUpload.mockResolvedValue(MOCK_ENGAGEMENT);
    mockInsertPendingDocument.mockResolvedValue({ documentId: DOCUMENT_ID, storageKey: STORAGE_KEY });
    mockGetSignedUploadUrl.mockResolvedValue({ url: UPLOAD_URL, expiresAt: new Date() });
    mockCompleteUpload.mockResolvedValue({ outcome: "active", documentId: DOCUMENT_ID });
    mockReplaceDocumentWithNewVersion.mockResolvedValue({ newVersionId: "ver-001", newVersion: 2, newStorageKey: STORAGE_KEY });
    mockRecordAuthEvent.mockResolvedValue(undefined);
  });

  // requestUploadUrlAction — identity guard
  it("[AC-FILE-001-01][security] requestUploadUrlAction: null identity rejected, no DB write", async () => {
    // CS-TS-004: identity from verified session only — null means no valid session
    const result = await requestUploadUrlAction(ENGAGEMENT_ID, "test.pdf", "application/pdf", 1024);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockAuthorizeAccountantUpload).not.toHaveBeenCalled();
    expect(mockInsertPendingDocument).not.toHaveBeenCalled();
  });

  it("[AC-FILE-001-01][security] requestUploadUrlAction: CLIENT role rejected, no DB write", async () => {
    // CS-TS-004: only ACCOUNTANT role is allowed
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await requestUploadUrlAction(ENGAGEMENT_ID, "test.pdf", "application/pdf", 1024);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockAuthorizeAccountantUpload).not.toHaveBeenCalled();
    expect(mockInsertPendingDocument).not.toHaveBeenCalled();
  });

  // completeUploadAction — identity guard
  it("[AC-FILE-001-01][security] completeUploadAction: null identity rejected, no DB write", async () => {
    const result = await completeUploadAction(ENGAGEMENT_ID, DOCUMENT_ID, STORAGE_KEY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockCompleteUpload).not.toHaveBeenCalled();
  });

  it("[AC-FILE-001-01][security] completeUploadAction: CLIENT role rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await completeUploadAction(ENGAGEMENT_ID, DOCUMENT_ID, STORAGE_KEY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockCompleteUpload).not.toHaveBeenCalled();
  });

  // replaceWithNewVersionAction — identity guard
  it("[AC-FILE-009-01][security] replaceWithNewVersionAction: null identity rejected, no DB write", async () => {
    const result = await replaceWithNewVersionAction(ENGAGEMENT_ID, DOCUMENT_ID, "v2.pdf", "application/pdf", 2048);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockReplaceDocumentWithNewVersion).not.toHaveBeenCalled();
  });

  it("[AC-FILE-009-01][security] replaceWithNewVersionAction: CLIENT role rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await replaceWithNewVersionAction(ENGAGEMENT_ID, DOCUMENT_ID, "v2.pdf", "application/pdf", 2048);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockReplaceDocumentWithNewVersion).not.toHaveBeenCalled();
  });

  // listDocumentsAction — identity guard
  it("[AC-FILE-001-01][security] listDocumentsAction: null identity rejected, no DB read", async () => {
    const result = await listDocumentsAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockListEngagementDocuments).not.toHaveBeenCalled();
    expect(mockWithRequestContext).not.toHaveBeenCalled();
  });
});

// ─── Tests: rate-limit enforcement (ADR-022) ─────────────────────────────────
//
// The rate-limit consume() call must fire BEFORE any authorize/DB write.
// ADR-022: per-IP upload budget consumed before URL mint.

describe("[AC-FILE-001-01] [ADR-022] rate-limit is enforced on upload actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetRateLimiter.mockReturnValue({ consume: mockLimiterConsume });
    mockAuthorizeAccountantUpload.mockResolvedValue(MOCK_ENGAGEMENT);
    mockInsertPendingDocument.mockResolvedValue({ documentId: DOCUMENT_ID, storageKey: STORAGE_KEY });
    mockGetSignedUploadUrl.mockResolvedValue({ url: UPLOAD_URL, expiresAt: new Date() });
    mockRecordAuthEvent.mockResolvedValue(undefined);
  });

  it("[AC-FILE-001-01][ADR-022] requestUploadUrlAction: rate-limit exceeded → refused before any DB write", async () => {
    // ADR-022: when budget exhausted, refuse BEFORE authorize
    // Cast as unknown first to allow the optional retryAfterMs field in the mock return
    mockLimiterConsume.mockReturnValue({ allowed: false, retryAfterMs: 60000 } as unknown as { allowed: boolean });

    const result = await requestUploadUrlAction(ENGAGEMENT_ID, "test.pdf", "application/pdf", 1024);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/too many|wait/i);
    // ADR-022: authorize must NOT be called when rate-limited
    expect(mockAuthorizeAccountantUpload).not.toHaveBeenCalled();
    expect(mockInsertPendingDocument).not.toHaveBeenCalled();
  });

  it("[AC-FILE-009-01][ADR-022] replaceWithNewVersionAction: rate-limit exceeded → refused before any DB write", async () => {
    mockLimiterConsume.mockReturnValue({ allowed: false, retryAfterMs: 60000 } as unknown as { allowed: boolean });

    const result = await replaceWithNewVersionAction(ENGAGEMENT_ID, DOCUMENT_ID, "v2.pdf", "application/pdf", 2048);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/too many|wait/i);
    // ADR-022: replace seam must NOT be called when rate-limited
    expect(mockReplaceDocumentWithNewVersion).not.toHaveBeenCalled();
  });

  it("[AC-FILE-001-01] requestUploadUrlAction: rate-limiter.consume() is called before authorize", async () => {
    // Verify ordering: limiter.consume fires, then authorize
    const callOrder: string[] = [];
    mockLimiterConsume.mockImplementation(() => {
      callOrder.push("consume");
      return { allowed: true };
    });
    mockAuthorizeAccountantUpload.mockImplementation(async () => {
      callOrder.push("authorize");
      return MOCK_ENGAGEMENT;
    });
    mockInsertPendingDocument.mockResolvedValue({ documentId: DOCUMENT_ID, storageKey: STORAGE_KEY });
    mockGetSignedUploadUrl.mockResolvedValue({ url: UPLOAD_URL, expiresAt: new Date() });

    await requestUploadUrlAction(ENGAGEMENT_ID, "test.pdf", "application/pdf", 1024);

    // ADR-022: consume must come before authorize
    expect(callOrder.indexOf("consume")).toBeLessThan(callOrder.indexOf("authorize"));
  });
});

// ─── Tests: requestUploadUrlAction — happy path ───────────────────────────────
//
// [AC-FILE-001-01] Accountant uploads a file to an engagement.

describe("[AC-FILE-001-01] requestUploadUrlAction — accountant uploads a file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetRateLimiter.mockReturnValue({ consume: mockLimiterConsume });
    mockLimiterConsume.mockReturnValue({ allowed: true });
    mockAuthorizeAccountantUpload.mockResolvedValue(MOCK_ENGAGEMENT);
    mockInsertPendingDocument.mockResolvedValue({ documentId: DOCUMENT_ID, storageKey: STORAGE_KEY });
    mockGetSignedUploadUrl.mockResolvedValue({ url: UPLOAD_URL, expiresAt: new Date() });
    mockRecordAuthEvent.mockResolvedValue(undefined);
  });

  it("[AC-FILE-001-01] returns { success: true, data } with documentId, uploadUrl, storageKey", async () => {
    const result = await requestUploadUrlAction(ENGAGEMENT_ID, "report.pdf", "application/pdf", 1024);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.documentId).toBe(DOCUMENT_ID);
      expect(result.data.uploadUrl).toBe(UPLOAD_URL);
      expect(result.data.storageKey).toBe(STORAGE_KEY);
    }
  });

  it("[AC-FILE-001-01] authorizeAccountantUpload called with engagementId", async () => {
    await requestUploadUrlAction(ENGAGEMENT_ID, "report.pdf", "application/pdf", 1024);

    // ADR-009: authorize BEFORE URL mint
    expect(mockAuthorizeAccountantUpload).toHaveBeenCalledOnce();
    expect(mockAuthorizeAccountantUpload).toHaveBeenCalledWith(
      expect.objectContaining({ engagementId: ENGAGEMENT_ID }),
    );
  });

  it("[AC-FILE-001-01] insertPendingDocument called with accountant clerkUserId from verified session", async () => {
    await requestUploadUrlAction(ENGAGEMENT_ID, "report.pdf", "application/pdf", 1024);

    // ADR-003 / CS-TS-004: uploadedByClerkId comes from verified session, not from args
    expect(mockInsertPendingDocument).toHaveBeenCalledOnce();
    expect(mockInsertPendingDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        uploadedByClerkId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004: from session
      }),
    );
  });

  it("[AC-FILE-001-01] recordAuthEvent called with actor from verified session (ADR-019)", async () => {
    await requestUploadUrlAction(ENGAGEMENT_ID, "report.pdf", "application/pdf", 1024);

    // ADR-019: actor comes ONLY from the verified session
    expect(mockRecordAuthEvent).toHaveBeenCalledOnce();
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId, // ADR-019
        }),
        action: "document.upload_url_minted",
        sourceSurface: "admin", // ADR-006
      }),
    );
  });

  it("[AC-FILE-001-01] returns { success: false } when engagement not found (authorize returns null)", async () => {
    mockAuthorizeAccountantUpload.mockResolvedValue(null);

    const result = await requestUploadUrlAction(ENGAGEMENT_ID, "report.pdf", "application/pdf", 1024);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/engagement|not found/i);
    expect(mockInsertPendingDocument).not.toHaveBeenCalled();
  });

  it("[AC-FILE-001-01] returns { success: false } when engagementId is empty", async () => {
    const result = await requestUploadUrlAction("", "report.pdf", "application/pdf", 1024);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/engagement|id/i);
    // No authorize or DB write when input is invalid
    expect(mockAuthorizeAccountantUpload).not.toHaveBeenCalled();
    expect(mockInsertPendingDocument).not.toHaveBeenCalled();
  });

  it("[AC-FILE-001-01] returns { success: false } when filename is empty", async () => {
    const result = await requestUploadUrlAction(ENGAGEMENT_ID, "", "application/pdf", 1024);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/filename/i);
    expect(mockInsertPendingDocument).not.toHaveBeenCalled();
  });
});

// ─── Tests: completeUploadAction — scan-promote gate ─────────────────────────
//
// [AC-FILE-001-01] Phase 2: scan-before-available gate (ADR-021).

describe("[AC-FILE-001-01] completeUploadAction — scan-before-available gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetRateLimiter.mockReturnValue({ consume: mockLimiterConsume });
    mockLimiterConsume.mockReturnValue({ allowed: true });
    mockCompleteUpload.mockResolvedValue({ outcome: "active", documentId: DOCUMENT_ID });
    mockRecordAuthEvent.mockResolvedValue(undefined);
  });

  it("[AC-FILE-001-01] returns { success: true, data: { outcome: 'active' } } when scan passes", async () => {
    const result = await completeUploadAction(ENGAGEMENT_ID, DOCUMENT_ID, STORAGE_KEY);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("active");
    }
    expect(mockCompleteUpload).toHaveBeenCalledOnce();
    expect(mockCompleteUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: DOCUMENT_ID,
        storageKey: STORAGE_KEY,
        engagementId: ENGAGEMENT_ID,
        uploadedByClerkId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004
      }),
    );
  });

  it("[AC-FILE-001-01] returns { success: true, data: { outcome: 'infected' } } when scan finds threat", async () => {
    mockCompleteUpload.mockResolvedValue({ outcome: "infected", documentId: DOCUMENT_ID, threat: "EICAR-Test" });

    const result = await completeUploadAction(ENGAGEMENT_ID, DOCUMENT_ID, STORAGE_KEY);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("infected");
    }
  });

  it("[AC-FILE-001-01] returns { success: true, data: { outcome: 'pending' } } when scan is indeterminate", async () => {
    mockCompleteUpload.mockResolvedValue({ outcome: "pending", documentId: DOCUMENT_ID, reason: "scanner-indeterminate" });

    const result = await completeUploadAction(ENGAGEMENT_ID, DOCUMENT_ID, STORAGE_KEY);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("pending");
    }
  });

  it("[AC-FILE-001-01] recordAuthEvent called with actor from verified session (ADR-019)", async () => {
    await completeUploadAction(ENGAGEMENT_ID, DOCUMENT_ID, STORAGE_KEY);

    expect(mockRecordAuthEvent).toHaveBeenCalledOnce();
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId, // ADR-019
        }),
        action: "document.upload_completed",
        sourceSurface: "admin", // ADR-006
      }),
    );
  });

  it("[AC-FILE-001-01] revalidatePath called for the engagement documents page", async () => {
    await completeUploadAction(ENGAGEMENT_ID, DOCUMENT_ID, STORAGE_KEY);

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining(ENGAGEMENT_ID),
    );
  });

  it("[AC-FILE-001-01] returns { success: false } when engagementId is empty", async () => {
    const result = await completeUploadAction("", DOCUMENT_ID, STORAGE_KEY);

    expect(result.success).toBe(false);
    expect(mockCompleteUpload).not.toHaveBeenCalled();
  });

  it("[AC-FILE-001-01] returns { success: false } when documentId is empty", async () => {
    const result = await completeUploadAction(ENGAGEMENT_ID, "", STORAGE_KEY);

    expect(result.success).toBe(false);
    expect(mockCompleteUpload).not.toHaveBeenCalled();
  });
});

// ─── Tests: replaceWithNewVersionAction — version replacement ─────────────────
//
// [AC-FILE-009-01] Accountant replaces a file with a new version.
// [AC-FILE-009-02] After replacement, newest version is presented as current.

describe("[AC-FILE-009-01] [AC-FILE-009-02] replaceWithNewVersionAction — version replacement", () => {
  const NEW_VERSION_ID = "ver-013-002";
  const NEW_STORAGE_KEY = `engagements/${ENGAGEMENT_ID}/documents/${DOCUMENT_ID}/v2/report-v2.pdf`;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetRateLimiter.mockReturnValue({ consume: mockLimiterConsume });
    mockLimiterConsume.mockReturnValue({ allowed: true });
    mockReplaceDocumentWithNewVersion.mockResolvedValue({
      newVersionId: NEW_VERSION_ID,
      newVersion: 2,
      newStorageKey: NEW_STORAGE_KEY,
    });
    mockGetSignedUploadUrl.mockResolvedValue({ url: UPLOAD_URL, expiresAt: new Date() });
    mockRecordAuthEvent.mockResolvedValue(undefined);
  });

  it("[AC-FILE-009-01] returns { success: true, data } with newVersionId, newVersion, uploadUrl, storageKey", async () => {
    const result = await replaceWithNewVersionAction(
      ENGAGEMENT_ID, DOCUMENT_ID, "report-v2.pdf", "application/pdf", 2048,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.documentId).toBe(DOCUMENT_ID);
      expect(result.data.newVersionId).toBe(NEW_VERSION_ID);
      expect(result.data.newVersion).toBe(2);
      expect(result.data.uploadUrl).toBe(UPLOAD_URL);
      expect(result.data.storageKey).toBe(NEW_STORAGE_KEY);
    }
  });

  it("[AC-FILE-009-01] replaceDocumentWithNewVersion called with accountant clerkUserId from verified session", async () => {
    await replaceWithNewVersionAction(
      ENGAGEMENT_ID, DOCUMENT_ID, "report-v2.pdf", "application/pdf", 2048,
    );

    // DECISION-013-C: replace seam called with correct params
    expect(mockReplaceDocumentWithNewVersion).toHaveBeenCalledOnce();
    expect(mockReplaceDocumentWithNewVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: DOCUMENT_ID,
        engagementId: ENGAGEMENT_ID,
        originalFilename: "report-v2.pdf",
        uploadedByClerkId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004: from session
        sourceSurface: "admin", // ADR-006
      }),
    );
  });

  it("[AC-FILE-009-02] getSignedUploadUrl called with new storage key (new version is current)", async () => {
    await replaceWithNewVersionAction(
      ENGAGEMENT_ID, DOCUMENT_ID, "report-v2.pdf", "application/pdf", 2048,
    );

    // ADR-009: new storage key for the replacement object
    expect(mockGetSignedUploadUrl).toHaveBeenCalledWith(
      NEW_STORAGE_KEY, // the new version's storage key
      expect.anything(),
    );
  });

  it("[AC-FILE-009-01] revalidatePath called for the engagement documents page", async () => {
    await replaceWithNewVersionAction(
      ENGAGEMENT_ID, DOCUMENT_ID, "report-v2.pdf", "application/pdf", 2048,
    );

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining(ENGAGEMENT_ID),
    );
  });

  it("[AC-FILE-009-01] returns { success: false } when documentId is empty", async () => {
    const result = await replaceWithNewVersionAction(ENGAGEMENT_ID, "", "v2.pdf", "application/pdf", 2048);

    expect(result.success).toBe(false);
    expect(mockReplaceDocumentWithNewVersion).not.toHaveBeenCalled();
  });

  it("[AC-FILE-009-01] returns { success: false } when replaceDocumentWithNewVersion throws", async () => {
    mockReplaceDocumentWithNewVersion.mockRejectedValue(new Error("Document not found in engagement"));

    const result = await replaceWithNewVersionAction(
      ENGAGEMENT_ID, DOCUMENT_ID, "report-v2.pdf", "application/pdf", 2048,
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/failed|try again/i);
  });
});

// ─── Tests: requestDownloadUrlAction — ADR-019 audit emission ─────────────────
//
// TASK-013-007: Validate fix-forward — download URL mint must emit a recordAuthEvent call.
//
// [ADR-019] Download URL mint is an audited access event.
// [CS-GEN-001] targetId = documentId only; signed URL and filename NEVER in the audit payload.
// [CS-TS-004] Actor from the verified session — never from args.
// [ADR-003] getAccountantIdentity() called before any DB query.

describe("[ADR-019] [CS-GEN-001] requestDownloadUrlAction — audit emission on download", () => {
  const DOWNLOAD_URL = "http://localhost:10000/devstoreaccount1/dl/test?sas=dltoken";
  const EXPIRES_AT = new Date(Date.now() + 300_000);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetRateLimiter.mockReturnValue({ consume: mockLimiterConsume });
    mockLimiterConsume.mockReturnValue({ allowed: true });
    mockRecordAuthEvent.mockResolvedValue(undefined);
    // withRequestContext calls the callback — pass-through so authorizeThenSignDownload is invoked
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
    const result = await requestDownloadUrlAction(DOCUMENT_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    expect(mockRecordAuthEvent).toHaveBeenCalledOnce(); // ADR-019: exactly one audit event
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004: from verified session
        }),
        action: "document.download",                    // ADR-019: correct action name
        targetType: "Document",
        targetId: DOCUMENT_ID,                          // CS-GEN-001: documentId only
        sourceSurface: "admin",                         // ADR-006: admin surface
      }),
    );
  });

  it("[CS-GEN-001] audit payload contains NO signed URL or filename (CS-GEN-001 / ADR-009)", async () => {
    // CS-GEN-001: signed URL is transient and NEVER persisted or logged (ADR-009).
    // The audit payload must not contain the signed URL or any filename/PII.
    await requestDownloadUrlAction(DOCUMENT_ID, ENGAGEMENT_ID);

    expect(mockRecordAuthEvent).toHaveBeenCalledOnce();
    const callArg = mockRecordAuthEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    // Verify the entire call arg — targetId should be documentId, NOT the signed URL
    expect(callArg["targetId"]).toBe(DOCUMENT_ID);
    expect(callArg["targetId"]).not.toBe(DOWNLOAD_URL); // CS-GEN-001: signed URL NOT in payload
    // No filename field in the audit payload
    expect(callArg).not.toHaveProperty("filename");
    expect(callArg).not.toHaveProperty("storageKey");
  });

  it("[ADR-019] unauthorized / rls-filtered download: NO success audit event recorded", async () => {
    // ADR-019: a refused authorization must NOT record a successful-access event.
    // The audit fires ONLY on the SUCCESS path (after authorizeThenSignDownload returns authorized=true).
    mockAuthorizeThenSignDownload.mockResolvedValue({
      authorized: false,
      reason: "rls-filtered",
    });

    const result = await requestDownloadUrlAction(DOCUMENT_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    expect(mockRecordAuthEvent).not.toHaveBeenCalled(); // ADR-019: NO event on refusal
  });

  it("[ADR-019] not-active refusal: NO success audit event recorded", async () => {
    // ADR-019: 'not-active' (pending/infected) is also a refusal — no audit event.
    mockAuthorizeThenSignDownload.mockResolvedValue({
      authorized: false,
      reason: "not-active",
    });

    const result = await requestDownloadUrlAction(DOCUMENT_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    expect(mockRecordAuthEvent).not.toHaveBeenCalled(); // ADR-019: NO event on refusal
  });

  it("[ADR-003] [CS-TS-004] null identity: action rejected, NO audit event", async () => {
    // ADR-003: identity guard before any DB access.
    // CS-TS-004: actor from verified session — no session means no audit.
    mockGetIdentity.mockResolvedValue(null);

    const result = await requestDownloadUrlAction(DOCUMENT_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    expect(mockAuthorizeThenSignDownload).not.toHaveBeenCalled();
    expect(mockRecordAuthEvent).not.toHaveBeenCalled();
  });
});

// ─── Tests: requestDownloadUrlForVersionAction — ADR-019 audit emission ────────
//
// TASK-013-007: version download path also emits the audit event.
// [ADR-019] Version download URL mint is an audited access event.
// [CS-GEN-001] targetId = parent documentId (NOT the version storageKey or signed URL).

describe("[ADR-019] [CS-GEN-001] requestDownloadUrlForVersionAction — audit emission on version download", () => {
  const VERSION_DOWNLOAD_URL = "http://localhost:10000/devstoreaccount1/dl/v2test?sas=v2token";
  const EXPIRES_AT = new Date(Date.now() + 300_000);

  const MOCK_VERSION_ITEM = {
    id: VERSION_ID,
    documentId: DOCUMENT_ID,
    version: 2,
    storageKey: VERSION_STORAGE_KEY,
    supersededAt: new Date(),
    uploadedBy: ACCOUNTANT_IDENTITY.clerkUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetRateLimiter.mockReturnValue({ consume: mockLimiterConsume });
    mockLimiterConsume.mockReturnValue({ allowed: true });
    mockRecordAuthEvent.mockResolvedValue(undefined);
    // withRequestContext calls the callback — pass-through so authorizeThenSignDownload + listDocumentVersions fire
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => unknown) => cb(),
    );
    // Authorize via parent doc succeeds
    mockAuthorizeThenSignDownload.mockResolvedValue({
      authorized: true,
      url: "http://localhost:10000/devstoreaccount1/dl/parent?sas=parenttoken",
      expiresAt: EXPIRES_AT,
    });
    // listDocumentVersions returns the version row (server-resolved storageKey)
    mockListDocumentVersions.mockResolvedValue([MOCK_VERSION_ITEM]);
    // Version storage key sign
    mockGetSignedDownloadUrl.mockResolvedValue({
      url: VERSION_DOWNLOAD_URL,
      expiresAt: EXPIRES_AT,
    });
  });

  it("[ADR-019] success path: recordAuthEvent called once with action=document.download, targetId=documentId", async () => {
    // ADR-019: version download audit also uses the parent documentId as targetId.
    // CS-GEN-001: version storageKey is NOT in the audit payload.
    const result = await requestDownloadUrlForVersionAction(
      DOCUMENT_ID, ENGAGEMENT_ID, VERSION_ID,
    );

    expect(result.success).toBe(true);
    expect(mockRecordAuthEvent).toHaveBeenCalledOnce(); // ADR-019: exactly one audit event
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004: from verified session
        }),
        action: "document.download",                    // ADR-019: consistent action name
        targetType: "Document",
        targetId: DOCUMENT_ID,                          // CS-GEN-001: parent documentId only
        sourceSurface: "admin",                         // ADR-006
      }),
    );
  });

  it("[CS-GEN-001] version download audit payload: targetId is documentId, NOT the version storageKey or signed URL", async () => {
    // CS-GEN-001: neither the version storageKey nor the signed URL may appear in the audit payload.
    await requestDownloadUrlForVersionAction(DOCUMENT_ID, ENGAGEMENT_ID, VERSION_ID);

    expect(mockRecordAuthEvent).toHaveBeenCalledOnce();
    const callArg = mockRecordAuthEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg["targetId"]).toBe(DOCUMENT_ID);            // CS-GEN-001: parent documentId
    expect(callArg["targetId"]).not.toBe(VERSION_STORAGE_KEY); // NOT the version key
    expect(callArg["targetId"]).not.toBe(VERSION_DOWNLOAD_URL); // NOT the signed URL
    expect(callArg).not.toHaveProperty("storageKey");
    expect(callArg).not.toHaveProperty("filename");
  });

  it("[ADR-019] unauthorized version download: NO success audit event recorded", async () => {
    // ADR-019: refused authorization must NOT record a successful-access event.
    mockAuthorizeThenSignDownload.mockResolvedValue({
      authorized: false,
      reason: "rls-filtered",
    });

    const result = await requestDownloadUrlForVersionAction(
      DOCUMENT_ID, ENGAGEMENT_ID, VERSION_ID,
    );

    expect(result.success).toBe(false);
    expect(mockRecordAuthEvent).not.toHaveBeenCalled(); // ADR-019: NO event on refusal
  });

  it("[ADR-003] null identity: version download rejected, NO audit event", async () => {
    // ADR-003: identity guard before any DB access.
    mockGetIdentity.mockResolvedValue(null);

    const result = await requestDownloadUrlForVersionAction(
      DOCUMENT_ID, ENGAGEMENT_ID, VERSION_ID,
    );

    expect(result.success).toBe(false);
    expect(mockRecordAuthEvent).not.toHaveBeenCalled();
  });

  it("[security] IDOR: versionId belonging to a different document → no URL minted, getSignedDownloadUrl not called", async () => {
    // SECURITY: The accountant passes a valid DOCUMENT_ID + ENGAGEMENT_ID but supplies a
    // VERSION_ID that belongs to a different document/engagement. The server resolves the
    // version row under RLS — listDocumentVersions returns only rows for DOCUMENT_ID, so
    // the foreign versionId is absent and no storageKey is ever signed.
    // ADR-003 // ADR-009 // sec.pol_DocumentVersion // CS-GEN-001
    const FOREIGN_VERSION_ID = "ver-013-FOREIGN-bbbb-cccc-000000000099";
    // listDocumentVersions scoped to DOCUMENT_ID — the foreign version is not in the list.
    mockListDocumentVersions.mockResolvedValue([MOCK_VERSION_ITEM]); // only own versions visible

    const result = await requestDownloadUrlForVersionAction(
      DOCUMENT_ID, ENGAGEMENT_ID, FOREIGN_VERSION_ID,
    );

    expect(result.success).toBe(false);
    // getSignedDownloadUrl must NOT have been called with any foreign storageKey.
    expect(mockGetSignedDownloadUrl).not.toHaveBeenCalled(); // ADR-009: no URL minted for unresolved version
    expect(mockRecordAuthEvent).not.toHaveBeenCalled();      // ADR-019: no audit on refusal
  });
});
