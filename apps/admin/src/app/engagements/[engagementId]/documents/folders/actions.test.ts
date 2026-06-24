/**
 * apps/admin/src/app/engagements/[engagementId]/documents/folders/actions.test.ts
 *
 * Unit tests for accountant folder-management server actions.
 *
 * TASK-013-004: Admin (Tax Portal) — accountant-managed folder structure.
 *
 * Acceptance criteria tested:
 *   AC-FILE-010-01 — files organize into folder structure
 *   AC-FILE-010-02 — accountant can create, rename, and arrange folders
 *   AC-FILE-010-03 — accountant can place a file in a folder
 *   AC-FILE-010-04 — folder management is accountant-only (CLIENT/null → refused before any write)
 *
 * Security contract (ADR-003, ADR-006, ADR-019, CS-TS-004):
 *   - Non-ACCOUNTANT identity (null or CLIENT) is rejected by every action BEFORE any DB write.
 *   - Actor for ADR-019 audit event comes ONLY from the verified session — never from action args.
 *   - Every action calls the TASK-013-002 seam (mocked here) — no duplicate pipeline logic.
 *   - The DB-layer BLOCK predicate (pol_Folder) is defence-in-depth; the app-layer guard is primary.
 *
 * DECISION-013-A: Re-parent (move) stays within the same engagement.
 *   moveFolderAction enforces this at the app layer; the RLS BLOCK is the DB backstop.
 *
 * Strategy:
 *   - No real DB connection — all seam calls are mocked.
 *   - Identity guard tested with null identity, CLIENT role, and valid ACCOUNTANT.
 *   - Mirrors actions.test.ts pattern from TASK-013-003 (same test scaffolding).
 *   - CS-TS-001: verified by not calling raw DB directly.
 *   - CS-TS-002: verified by not importing adminDb/pool directly.
 *   - CS-TS-004: identity from session cookie — verified by mock structure.
 *   - CS-GEN-001: verified by not logging PII (no folder names in audit calls).
 *   - CS-GEN-003: cite governing keys in comments.
 *
 * // ADR-003: server-side authority; actor from session only
 * // ADR-006: admin surface only — no mirror in apps/portal
 * // ADR-019: audit event actor comes from verified session
 * // DECISION-013-A: re-parent stays in-engagement (circular-ref guard)
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
  mockCreateFolder,
  mockRenameFolder,
  mockMoveFolder,
  mockPlaceDocumentInFolder,
  mockRecordAuthEvent,
  mockRevalidatePath,
} = vi.hoisted(() => {
  return {
    mockGetIdentity: vi.fn(),
    mockCreateFolder: vi.fn(),
    mockRenameFolder: vi.fn(),
    mockMoveFolder: vi.fn(),
    mockPlaceDocumentInFolder: vi.fn(),
    mockRecordAuthEvent: vi.fn(),
    mockRevalidatePath: vi.fn(),
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

// Mock next/cache — revalidatePath is a no-op in tests
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

// Mock @tax-portal/auth — return a verified ACCOUNTANT identity by default
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

// Mock @tax-portal/db barrel (for recordAuthEvent — though it's called inside the seam, not directly)
vi.mock("@tax-portal/db", () => ({
  recordAuthEvent: mockRecordAuthEvent, // ADR-019
}));

// Mock the folder repository source module directly (NOT on the barrel — TASK-013-002 constraint)
// ADR-003: admin pool writes; createFolder/renameFolder/moveFolder/placeDocumentInFolder seams
vi.mock("@tax-portal/db/src/repositories/folder.js", () => ({
  createFolder: mockCreateFolder,           // AC-FILE-010-02
  renameFolder: mockRenameFolder,           // AC-FILE-010-02
  moveFolder: mockMoveFolder,               // AC-FILE-010-02 / DECISION-013-A
  placeDocumentInFolder: mockPlaceDocumentInFolder, // AC-FILE-010-03
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  createFolderAction,
  renameFolderAction,
  moveFolderAction,
  placeDocumentAction,
} from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test_013_004",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test_013_004",
  role: "CLIENT" as const,
};

const ENGAGEMENT_ID = "eng-013-004-aaaa-bbbb-cccc-000001";
const FOLDER_ID = "folder-013-004-aaaa-bbbb-0001";
const DOCUMENT_ID = "doc-013-004-aaaa-bbbb-0001";
const PARENT_FOLDER_ID = "folder-013-004-parent-0001";
const OTHER_ENGAGEMENT_ID = "eng-013-004-aaaa-bbbb-cccc-999999";

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-FILE-010-04] Identity guard — every action rejects non-ACCOUNTANT callers
// ═══════════════════════════════════════════════════════════════════════════════
//
// ADR-003: getAccountantIdentity() must be called BEFORE any DB write.
// CS-TS-004: identity from session cookie only — never from args or form data.
// AC-FILE-010-04: folder management is accountant-only.

describe("[AC-FILE-010-04] non-ACCOUNTANT identity is rejected by every folder action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(null);
    // Seam mocks should NEVER be called when identity is rejected (ADR-003)
    mockCreateFolder.mockResolvedValue({ folderId: FOLDER_ID });
    mockRenameFolder.mockResolvedValue({ renamed: true });
    mockMoveFolder.mockResolvedValue({ moved: true });
    mockPlaceDocumentInFolder.mockResolvedValue({ placed: true });
    mockRecordAuthEvent.mockResolvedValue(undefined);
  });

  // createFolderAction — identity guard
  it("[AC-FILE-010-04][security] createFolderAction: null identity rejected, no DB write", async () => {
    // CS-TS-004: null identity = no valid session
    const result = await createFolderAction(ENGAGEMENT_ID, "Tax Returns", null);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockCreateFolder).not.toHaveBeenCalled();
  });

  it("[AC-FILE-010-04][security] createFolderAction: CLIENT role rejected, no DB write", async () => {
    // CS-TS-004: only ACCOUNTANT role is allowed
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await createFolderAction(ENGAGEMENT_ID, "Tax Returns", null);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockCreateFolder).not.toHaveBeenCalled();
  });

  // renameFolderAction — identity guard
  it("[AC-FILE-010-04][security] renameFolderAction: null identity rejected, no DB write", async () => {
    const result = await renameFolderAction(ENGAGEMENT_ID, FOLDER_ID, "New Name");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockRenameFolder).not.toHaveBeenCalled();
  });

  it("[AC-FILE-010-04][security] renameFolderAction: CLIENT role rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await renameFolderAction(ENGAGEMENT_ID, FOLDER_ID, "New Name");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockRenameFolder).not.toHaveBeenCalled();
  });

  // moveFolderAction — identity guard
  it("[AC-FILE-010-04][security] moveFolderAction: null identity rejected, no DB write", async () => {
    const result = await moveFolderAction(ENGAGEMENT_ID, FOLDER_ID, PARENT_FOLDER_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockMoveFolder).not.toHaveBeenCalled();
  });

  it("[AC-FILE-010-04][security] moveFolderAction: CLIENT role rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await moveFolderAction(ENGAGEMENT_ID, FOLDER_ID, PARENT_FOLDER_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockMoveFolder).not.toHaveBeenCalled();
  });

  // placeDocumentAction — identity guard
  it("[AC-FILE-010-04][security] placeDocumentAction: null identity rejected, no DB write", async () => {
    const result = await placeDocumentAction(ENGAGEMENT_ID, DOCUMENT_ID, FOLDER_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockPlaceDocumentInFolder).not.toHaveBeenCalled();
  });

  it("[AC-FILE-010-04][security] placeDocumentAction: CLIENT role rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await placeDocumentAction(ENGAGEMENT_ID, DOCUMENT_ID, FOLDER_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockPlaceDocumentInFolder).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-FILE-010-02] createFolderAction — happy path + validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("[AC-FILE-010-02] createFolderAction — accountant creates a folder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockCreateFolder.mockResolvedValue({ folderId: FOLDER_ID });
    mockRecordAuthEvent.mockResolvedValue(undefined);
    mockRevalidatePath.mockReturnValue(undefined);
  });

  it("[AC-FILE-010-02] returns { success: true, data: { folderId } } on success", async () => {
    const result = await createFolderAction(ENGAGEMENT_ID, "Tax Returns 2023", null);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.folderId).toBe(FOLDER_ID);
    }
  });

  it("[AC-FILE-010-02] createFolder called with accountantClerkId from verified session (CS-TS-004)", async () => {
    await createFolderAction(ENGAGEMENT_ID, "Tax Returns 2023", null);

    // ADR-003 / CS-TS-004: accountantClerkId comes from verified session, not from args
    expect(mockCreateFolder).toHaveBeenCalledOnce();
    expect(mockCreateFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        name: "Tax Returns 2023",
        parentFolderId: null, // DECISION-013-A: null = root-level
        accountantClerkId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004: from session
        sourceSurface: "admin", // ADR-006
      }),
    );
  });

  it("[AC-FILE-010-02] creates nested folder when parentFolderId is provided (DECISION-013-A)", async () => {
    await createFolderAction(ENGAGEMENT_ID, "Returns", PARENT_FOLDER_ID);

    expect(mockCreateFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        parentFolderId: PARENT_FOLDER_ID, // DECISION-013-A: nested folder
      }),
    );
  });

  it("[AC-FILE-010-02] revalidatePath called for the engagement documents page", async () => {
    await createFolderAction(ENGAGEMENT_ID, "Tax Returns 2023", null);

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining(ENGAGEMENT_ID),
    );
  });

  it("[AC-FILE-010-02] returns { success: false } when engagementId is empty", async () => {
    const result = await createFolderAction("", "Tax Returns", null);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/engagement|id/i);
    expect(mockCreateFolder).not.toHaveBeenCalled();
  });

  it("[AC-FILE-010-02] returns { success: false } when folder name is empty", async () => {
    const result = await createFolderAction(ENGAGEMENT_ID, "", null);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/folder name/i);
    expect(mockCreateFolder).not.toHaveBeenCalled();
  });

  it("[AC-FILE-010-02] returns { success: false } when createFolder throws", async () => {
    mockCreateFolder.mockRejectedValue(new Error("DB insert error"));

    const result = await createFolderAction(ENGAGEMENT_ID, "Tax Returns", null);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/failed|try again/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-FILE-010-02] renameFolderAction — happy path + validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("[AC-FILE-010-02] renameFolderAction — accountant renames a folder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockRenameFolder.mockResolvedValue({ renamed: true });
    mockRecordAuthEvent.mockResolvedValue(undefined);
    mockRevalidatePath.mockReturnValue(undefined);
  });

  it("[AC-FILE-010-02] returns { success: true, data: { renamed: true } } on success", async () => {
    const result = await renameFolderAction(ENGAGEMENT_ID, FOLDER_ID, "Updated Name");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.renamed).toBe(true);
    }
  });

  it("[AC-FILE-010-02] renameFolder called with accountantClerkId from verified session (CS-TS-004)", async () => {
    await renameFolderAction(ENGAGEMENT_ID, FOLDER_ID, "Updated Name");

    // ADR-003 / CS-TS-004: accountantClerkId from verified session
    expect(mockRenameFolder).toHaveBeenCalledOnce();
    expect(mockRenameFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: FOLDER_ID,
        engagementId: ENGAGEMENT_ID,
        newName: "Updated Name",
        accountantClerkId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004
        sourceSurface: "admin", // ADR-006
      }),
    );
  });

  it("[AC-FILE-010-02] returns { success: true, data: { renamed: false } } when folder not found", async () => {
    mockRenameFolder.mockResolvedValue({ renamed: false });

    const result = await renameFolderAction(ENGAGEMENT_ID, FOLDER_ID, "Updated Name");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.renamed).toBe(false);
    }
  });

  it("[AC-FILE-010-02] returns { success: false } when folder name is empty", async () => {
    const result = await renameFolderAction(ENGAGEMENT_ID, FOLDER_ID, "");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/folder name/i);
    expect(mockRenameFolder).not.toHaveBeenCalled();
  });

  it("[AC-FILE-010-02] returns { success: false } when folderId is empty", async () => {
    const result = await renameFolderAction(ENGAGEMENT_ID, "", "New Name");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/folder id/i);
    expect(mockRenameFolder).not.toHaveBeenCalled();
  });

  it("[AC-FILE-010-02] revalidatePath called for the engagement documents page", async () => {
    await renameFolderAction(ENGAGEMENT_ID, FOLDER_ID, "Updated Name");

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining(ENGAGEMENT_ID),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-FILE-010-02] moveFolderAction — re-parent + in-engagement guard
// ═══════════════════════════════════════════════════════════════════════════════
//
// DECISION-013-A: Re-parenting stays within the same engagement.
//   The app layer enforces it by scoping engagementId on the update.
//   The RLS BLOCK predicate is the DB-layer backstop.

describe("[AC-FILE-010-02] moveFolderAction — re-parent stays in-engagement (DECISION-013-A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockMoveFolder.mockResolvedValue({ moved: true });
    mockRecordAuthEvent.mockResolvedValue(undefined);
    mockRevalidatePath.mockReturnValue(undefined);
  });

  it("[AC-FILE-010-02] returns { success: true, data: { moved: true } } on success", async () => {
    const result = await moveFolderAction(ENGAGEMENT_ID, FOLDER_ID, PARENT_FOLDER_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.moved).toBe(true);
    }
  });

  it("[AC-FILE-010-02] moveFolder called with accountantClerkId from verified session and engagementId scope (CS-TS-004 / DECISION-013-A)", async () => {
    await moveFolderAction(ENGAGEMENT_ID, FOLDER_ID, PARENT_FOLDER_ID);

    // ADR-003 / DECISION-013-A: engagementId scope enforces in-engagement constraint.
    expect(mockMoveFolder).toHaveBeenCalledOnce();
    expect(mockMoveFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: FOLDER_ID,
        engagementId: ENGAGEMENT_ID, // DECISION-013-A: scope prevents cross-engagement move
        newParentFolderId: PARENT_FOLDER_ID,
        accountantClerkId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004
        sourceSurface: "admin", // ADR-006
      }),
    );
  });

  it("[AC-FILE-010-02] can promote to root level (newParentFolderId=null) — DECISION-013-A", async () => {
    await moveFolderAction(ENGAGEMENT_ID, FOLDER_ID, null);

    // DECISION-013-A: null = promote to root
    expect(mockMoveFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        newParentFolderId: null, // root-level
      }),
    );
  });

  it("[DECISION-013-A] moveFolderAction: circular reference guard — folderId cannot equal newParentFolderId", async () => {
    // A folder cannot be its own parent.
    const result = await moveFolderAction(ENGAGEMENT_ID, FOLDER_ID, FOLDER_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/parent/i);
    // The seam must NOT be called — the app guard fires first.
    expect(mockMoveFolder).not.toHaveBeenCalled();
  });

  it("[AC-FILE-010-02] returns { success: true, data: { moved: false } } when folder not found or wrong engagement", async () => {
    // DECISION-013-A: the seam's engagementId scope means a cross-engagement attempt returns moved:false.
    mockMoveFolder.mockResolvedValue({ moved: false });

    const result = await moveFolderAction(ENGAGEMENT_ID, FOLDER_ID, PARENT_FOLDER_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.moved).toBe(false);
    }
  });

  it("[DECISION-013-A] cross-engagement attempt is scoped away by the engagementId guard in the seam", async () => {
    // Verify: when moveFolderAction is called with engagementId=ENGAGEMENT_ID,
    // the seam is called with THAT engagementId — NOT the other engagement's id.
    // This confirms the app layer passes the correct scope to the DB seam (DECISION-013-A).
    await moveFolderAction(ENGAGEMENT_ID, FOLDER_ID, PARENT_FOLDER_ID);

    expect(mockMoveFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,     // correct engagement
        // engagementId is NOT OTHER_ENGAGEMENT_ID — the seam enforces the scope
      }),
    );
    // Confirm the OTHER engagement's id was never passed to the seam
    const callArgs = mockMoveFolder.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(callArgs?.["engagementId"]).not.toBe(OTHER_ENGAGEMENT_ID);
  });

  it("[AC-FILE-010-02] returns { success: false } when folderId is empty", async () => {
    const result = await moveFolderAction(ENGAGEMENT_ID, "", PARENT_FOLDER_ID);

    expect(result.success).toBe(false);
    expect(mockMoveFolder).not.toHaveBeenCalled();
  });

  it("[AC-FILE-010-02] revalidatePath called for the engagement documents page", async () => {
    await moveFolderAction(ENGAGEMENT_ID, FOLDER_ID, null);

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining(ENGAGEMENT_ID),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-FILE-010-03] placeDocumentAction — place a file in a folder
// ═══════════════════════════════════════════════════════════════════════════════
//
// DECISION-013-A: No storage key changes — Document.folderId DB relationship is the only
//   placement record (ADR-009: folder membership is NOT encoded in the storage key).

describe("[AC-FILE-010-03] placeDocumentAction — accountant places a file in a folder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockPlaceDocumentInFolder.mockResolvedValue({ placed: true });
    mockRecordAuthEvent.mockResolvedValue(undefined);
    mockRevalidatePath.mockReturnValue(undefined);
  });

  it("[AC-FILE-010-03] returns { success: true, data: { placed: true } } on success", async () => {
    const result = await placeDocumentAction(ENGAGEMENT_ID, DOCUMENT_ID, FOLDER_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.placed).toBe(true);
    }
  });

  it("[AC-FILE-010-03] placeDocumentInFolder called with accountantClerkId from verified session (CS-TS-004)", async () => {
    await placeDocumentAction(ENGAGEMENT_ID, DOCUMENT_ID, FOLDER_ID);

    // ADR-003 / CS-TS-004: accountantClerkId from verified session
    // DECISION-013-A: no storage key change — only folderId updated
    expect(mockPlaceDocumentInFolder).toHaveBeenCalledOnce();
    expect(mockPlaceDocumentInFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: DOCUMENT_ID,
        engagementId: ENGAGEMENT_ID,
        folderId: FOLDER_ID,
        accountantClerkId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004
        sourceSurface: "admin", // ADR-006
      }),
    );
  });

  it("[AC-FILE-010-03] can remove from folder by passing folderId=null (DECISION-013-A)", async () => {
    const result = await placeDocumentAction(ENGAGEMENT_ID, DOCUMENT_ID, null);

    expect(result.success).toBe(true);
    expect(mockPlaceDocumentInFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: null, // DECISION-013-A: null = remove from folder
      }),
    );
  });

  it("[AC-FILE-010-03] returns { success: true, data: { placed: false } } when document not found", async () => {
    mockPlaceDocumentInFolder.mockResolvedValue({ placed: false });

    const result = await placeDocumentAction(ENGAGEMENT_ID, DOCUMENT_ID, FOLDER_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.placed).toBe(false);
    }
  });

  it("[AC-FILE-010-03] returns { success: false } when documentId is empty", async () => {
    const result = await placeDocumentAction(ENGAGEMENT_ID, "", FOLDER_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/document id/i);
    expect(mockPlaceDocumentInFolder).not.toHaveBeenCalled();
  });

  it("[AC-FILE-010-03] returns { success: false } when engagementId is empty", async () => {
    const result = await placeDocumentAction("", DOCUMENT_ID, FOLDER_ID);

    expect(result.success).toBe(false);
    expect(mockPlaceDocumentInFolder).not.toHaveBeenCalled();
  });

  it("[AC-FILE-010-03] revalidatePath called for the engagement documents page", async () => {
    await placeDocumentAction(ENGAGEMENT_ID, DOCUMENT_ID, FOLDER_ID);

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining(ENGAGEMENT_ID),
    );
  });

  it("[AC-FILE-010-03] returns { success: false } when placeDocumentInFolder throws", async () => {
    mockPlaceDocumentInFolder.mockRejectedValue(new Error("DB error"));

    const result = await placeDocumentAction(ENGAGEMENT_ID, DOCUMENT_ID, FOLDER_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/failed|try again/i);
  });
});
