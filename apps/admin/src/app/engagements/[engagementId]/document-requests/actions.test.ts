/**
 * apps/admin/src/app/engagements/[engagementId]/document-requests/actions.test.ts
 *
 * Unit tests for the document-request server actions.
 *
 * AC-FILE-007-01: createDocumentRequestAction — accountant creates a labeled document request.
 *
 * Security contract (ADR-005, ADR-006):
 *   - Non-accountant identity (null or CLIENT) is rejected; no write reaches the repository.
 *   - createdByClerkId comes ONLY from the verified session — never from action arguments.
 *   - Label validation: empty/whitespace-only rejected; over-cap (>500 chars) rejected.
 *   - ADR-003: listDocumentRequestsAction wraps listDocumentRequestsForEngagement in
 *     withRequestContext; the mock verifies this.
 *
 * Strategy:
 *   - No real DB connection — all repository calls are mocked.
 *   - Identity guard tested with null identity, CLIENT role, and valid ACCOUNTANT.
 *   - Mirrors apps/admin/src/app/settings/questionnaire-templates/actions.test.ts pattern exactly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocumentRequestItem, DocumentRequestAdminItem } from "@tax-portal/db";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockCreateDocumentRequestAsAccountant,
  mockListDocumentRequestsForEngagement,
  mockListDocumentRequestsForEngagementAdmin,
  mockRevalidatePath,
  mockWithRequestContext,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockCreateDocumentRequestAsAccountant: vi.fn(),
  mockListDocumentRequestsForEngagement: vi.fn(),
  mockListDocumentRequestsForEngagementAdmin: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockWithRequestContext: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers — server action reads cookie header to build synthetic Request
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === "cookie" ? "mock-cookie=session" : null),
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

// Mock @tax-portal/db barrel — for listDocumentRequestsForEngagement, the admin variant, and withRequestContext
vi.mock("@tax-portal/db", () => ({
  withRequestContext: mockWithRequestContext,
  listDocumentRequestsForEngagement: mockListDocumentRequestsForEngagement,
  listDocumentRequestsForEngagementAdmin: mockListDocumentRequestsForEngagementAdmin,
}));

// Mock the direct source-module import (NOT on the barrel — TASK-007-004 constraint)
vi.mock("@tax-portal/db/src/repositories/document-request.js", () => ({
  createDocumentRequestAsAccountant: mockCreateDocumentRequestAsAccountant,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  createDocumentRequestAction,
  listDocumentRequestsAction,
  listDocumentRequestsForAdminAction,
} from "./actions.js";
import { validateLabel, LABEL_MAX_LENGTH } from "./validation.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test",
  role: "CLIENT" as const,
};

const ENGAGEMENT_ID = "eng-001";

const DOCUMENT_REQUEST_ITEM: DocumentRequestItem = {
  id: "dr-001",
  engagementId: ENGAGEMENT_ID,
  label: "2023 W-2 form",
  createdBy: "user_acct_test",
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  dueDate: null, // TASK-019-004: dueDate added to DocumentRequestItem (nullable). // DECISION-019-C
};

// TASK-019-004: DocumentRequestAdminItem fixture (includes isOverdue + isFulfilled).
const DOCUMENT_REQUEST_ADMIN_ITEM: DocumentRequestAdminItem = {
  ...DOCUMENT_REQUEST_ITEM,
  isFulfilled: false,
  isOverdue: false,
};

// ─── Tests: validateLabel ─────────────────────────────────────────────────────

describe("validateLabel", () => {
  it("returns null for a valid label", () => {
    expect(validateLabel("2023 W-2 form")).toBeNull();
  });

  it("returns an error for an empty string", () => {
    const err = validateLabel("");
    expect(err).not.toBeNull();
    expect(err).toMatch(/required|empty/i);
  });

  it("returns an error for a whitespace-only string", () => {
    const err = validateLabel("   ");
    expect(err).not.toBeNull();
    expect(err).toMatch(/empty|whitespace/i);
  });

  it("returns an error for a label exceeding LABEL_MAX_LENGTH", () => {
    const overCap = "A".repeat(LABEL_MAX_LENGTH + 1);
    const err = validateLabel(overCap);
    expect(err).not.toBeNull();
    expect(err).toMatch(/must not exceed|500/i);
  });

  it("returns null for a label exactly at LABEL_MAX_LENGTH", () => {
    const atCap = "A".repeat(LABEL_MAX_LENGTH);
    expect(validateLabel(atCap)).toBeNull();
  });

  it("returns an error for a non-string input", () => {
    const err = validateLabel(42);
    expect(err).not.toBeNull();
    expect(err).toMatch(/string/i);
  });
});

// ─── Tests: createDocumentRequestAction ──────────────────────────────────────

describe("createDocumentRequestAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockCreateDocumentRequestAsAccountant.mockResolvedValue({ id: "dr-new-001" });
  });

  // ── AC-FILE-007-01: happy path ────────────────────────────────────────────

  it("[AC-FILE-007-01] creates a document request and returns success + id when ACCOUNTANT", async () => {
    const result = await createDocumentRequestAction(ENGAGEMENT_ID, "2023 W-2 form");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.id).toBe("dr-new-001");
    }
    expect(mockCreateDocumentRequestAsAccountant).toHaveBeenCalledOnce();
    expect(mockCreateDocumentRequestAsAccountant).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        label: "2023 W-2 form",
        createdByClerkId: ACCOUNTANT_IDENTITY.clerkUserId,
        dueDate: null, // TASK-019-004: dueDate=null when not provided // DECISION-019-C
      }),
    );
  });

  it("[AC-FILE-007-01] trims whitespace from label before writing", async () => {
    await createDocumentRequestAction(ENGAGEMENT_ID, "  2023 W-2 form  ");

    expect(mockCreateDocumentRequestAsAccountant).toHaveBeenCalledWith(
      expect.objectContaining({ label: "2023 W-2 form" }),
    );
  });

  // TASK-019-004: due date passing (DECISION-019-C / AC-FILE-012-04)
  it("[DECISION-019-C] passes dueDate to createDocumentRequestAsAccountant when provided", async () => {
    const due = new Date("2026-08-01T00:00:00.000Z");
    await createDocumentRequestAction(ENGAGEMENT_ID, "2023 W-2 form", due);

    expect(mockCreateDocumentRequestAsAccountant).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: due }),
    );
  });

  it("[AC-FILE-007-01] calls revalidatePath for the engagement document-requests page after success", async () => {
    await createDocumentRequestAction(ENGAGEMENT_ID, "2023 W-2 form");

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/engagements/${ENGAGEMENT_ID}/document-requests`,
    );
  });

  // ── Security: identity guard ──────────────────────────────────────────────

  it("[security] returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await createDocumentRequestAction(ENGAGEMENT_ID, "2023 W-2 form");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockCreateDocumentRequestAsAccountant).not.toHaveBeenCalled();
  });

  it("[security] returns { success: false } when role is CLIENT (not ACCOUNTANT)", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await createDocumentRequestAction(ENGAGEMENT_ID, "2023 W-2 form");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockCreateDocumentRequestAsAccountant).not.toHaveBeenCalled();
  });

  it("[security] createdByClerkId comes from the verified session — not from action arguments", async () => {
    await createDocumentRequestAction(ENGAGEMENT_ID, "2023 W-2 form");

    // The clerkUserId must match the session identity, not any value passed to the action.
    expect(mockCreateDocumentRequestAsAccountant).toHaveBeenCalledWith(
      expect.objectContaining({ createdByClerkId: ACCOUNTANT_IDENTITY.clerkUserId }),
    );
  });

  // ── Label validation ──────────────────────────────────────────────────────

  it("[validation] returns { success: false } when label is empty", async () => {
    const result = await createDocumentRequestAction(ENGAGEMENT_ID, "");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/required|empty/i);
    }
    expect(mockCreateDocumentRequestAsAccountant).not.toHaveBeenCalled();
  });

  it("[validation] returns { success: false } when label is whitespace-only", async () => {
    const result = await createDocumentRequestAction(ENGAGEMENT_ID, "   ");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/empty|whitespace/i);
    }
    expect(mockCreateDocumentRequestAsAccountant).not.toHaveBeenCalled();
  });

  it("[validation] returns { success: false } when label exceeds 500 chars", async () => {
    const overCap = "A".repeat(LABEL_MAX_LENGTH + 1);
    const result = await createDocumentRequestAction(ENGAGEMENT_ID, overCap);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/must not exceed|500/i);
    }
    expect(mockCreateDocumentRequestAsAccountant).not.toHaveBeenCalled();
  });

  it("[validation] succeeds with label exactly at LABEL_MAX_LENGTH", async () => {
    const atCap = "A".repeat(LABEL_MAX_LENGTH);
    const result = await createDocumentRequestAction(ENGAGEMENT_ID, atCap);

    expect(result.success).toBe(true);
    expect(mockCreateDocumentRequestAsAccountant).toHaveBeenCalledOnce();
  });

  it("[validation] returns { success: false } when engagementId is empty", async () => {
    const result = await createDocumentRequestAction("", "2023 W-2 form");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/engagement|id/i);
    }
    expect(mockCreateDocumentRequestAsAccountant).not.toHaveBeenCalled();
  });

  // ── revalidatePath not called on validation failure ───────────────────────

  it("does not call revalidatePath when label validation fails", async () => {
    await createDocumentRequestAction(ENGAGEMENT_ID, "");

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("does not call revalidatePath when identity guard rejects", async () => {
    mockGetIdentity.mockResolvedValue(null);
    await createDocumentRequestAction(ENGAGEMENT_ID, "2023 W-2 form");

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

// ─── Tests: listDocumentRequestsAction ───────────────────────────────────────

describe("listDocumentRequestsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockListDocumentRequestsForEngagement.mockResolvedValue([DOCUMENT_REQUEST_ITEM]);
    // withRequestContext pass-through — invoke the callback directly so the fn is still called
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, fn: () => Promise<unknown>) => fn(),
    );
  });

  it("[AC-FILE-007-01] returns success + list for the engagement when ACCOUNTANT", async () => {
    const result = await listDocumentRequestsAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.label).toBe("2023 W-2 form");
    }
    expect(mockListDocumentRequestsForEngagement).toHaveBeenCalledWith(ENGAGEMENT_ID);
  });

  it("[ADR-003] wraps listDocumentRequestsForEngagement in withRequestContext", async () => {
    await listDocumentRequestsAction(ENGAGEMENT_ID);

    // withRequestContext must have been called with the accountant's clerkUserId + role
    expect(mockWithRequestContext).toHaveBeenCalledWith(
      ACCOUNTANT_IDENTITY.clerkUserId,
      ACCOUNTANT_IDENTITY.role,
      expect.any(Function),
    );
  });

  it("returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await listDocumentRequestsAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockListDocumentRequestsForEngagement).not.toHaveBeenCalled();
  });

  it("returns { success: false } when role is CLIENT (not ACCOUNTANT)", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await listDocumentRequestsAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockListDocumentRequestsForEngagement).not.toHaveBeenCalled();
  });

  it("returns { success: false } when engagementId is empty", async () => {
    const result = await listDocumentRequestsAction("");

    expect(result.success).toBe(false);
    expect(mockListDocumentRequestsForEngagement).not.toHaveBeenCalled();
  });
});

// ─── Tests: listDocumentRequestsForAdminAction ────────────────────────────────

describe("listDocumentRequestsForAdminAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockListDocumentRequestsForEngagementAdmin.mockResolvedValue([DOCUMENT_REQUEST_ADMIN_ITEM]);
  });

  // AC-FILE-012-02: returns isOverdue per request for the accountant view.
  it("[AC-FILE-012-02] returns success + admin list (with isOverdue) for the engagement when ACCOUNTANT", async () => {
    const result = await listDocumentRequestsForAdminAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.label).toBe("2023 W-2 form");
      expect(result.data[0]).toHaveProperty("isOverdue");
      expect(result.data[0]).toHaveProperty("isFulfilled");
    }
    expect(mockListDocumentRequestsForEngagementAdmin).toHaveBeenCalledWith(ENGAGEMENT_ID);
  });

  it("[ADR-003] does NOT wrap in withRequestContext (admin pool — no SESSION_CONTEXT needed)", async () => {
    await listDocumentRequestsForAdminAction(ENGAGEMENT_ID);

    // Admin pool read — withRequestContext must NOT be called for this path. // ADR-003
    expect(mockWithRequestContext).not.toHaveBeenCalled();
  });

  it("returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await listDocumentRequestsForAdminAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockListDocumentRequestsForEngagementAdmin).not.toHaveBeenCalled();
  });

  it("returns { success: false } when role is CLIENT (not ACCOUNTANT)", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await listDocumentRequestsForAdminAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockListDocumentRequestsForEngagementAdmin).not.toHaveBeenCalled();
  });

  it("returns { success: false } when engagementId is empty", async () => {
    const result = await listDocumentRequestsForAdminAction("");

    expect(result.success).toBe(false);
    expect(mockListDocumentRequestsForEngagementAdmin).not.toHaveBeenCalled();
  });
});
