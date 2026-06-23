/**
 * apps/admin/src/app/engagements/[engagementId]/attributes/actions.test.ts
 *
 * Unit tests for engagement attribute server actions.
 *
 * TASK-011-003: Admin attribute server actions + UI panel (due date / note / priority flag).
 *
 * Acceptance criteria tested:
 *   AC-LIFE-007-01 — accountant sets a due date on an engagement
 *   AC-LIFE-007-02 — accountant updates a due date after it has been set
 *   AC-LIFE-008-01 — accountant records internal notes on an engagement
 *   AC-LIFE-009-01 — accountant flags an engagement as prioritized
 *   AC-LIFE-009-02 — accountant removes the flag/priority marker
 *
 * Security contract (ADR-003, ADR-006, ADR-019):
 *   - Non-ACCOUNTANT identity (null or CLIENT) is rejected by every action BEFORE any DB write.
 *   - Actor for ADR-019 audit event comes ONLY from the verified session — never from action args.
 *   - Every action calls the TASK-011-002 seam (mocked here) — no duplicate logic.
 *   - CS-GEN-001: note bodies are NEVER logged — audit rows only carry actor + engagementId.
 *
 * Strategy:
 *   - No real DB connection — all seam calls are mocked.
 *   - Identity guard tested with null identity, CLIENT role, and valid ACCOUNTANT.
 *   - Mirrors [engagementId]/actions.test.ts pattern EXACTLY (EPIC-010 precedent).
 *   - CS-TS-001: verified by not calling raw DB directly.
 *   - CS-TS-002: verified by not importing adminDb/pool directly.
 *   - CS-GEN-003: cite governing keys in comments.
 *
 * // ADR-003: server-side authority; actor from session only
 * // ADR-006: admin surface only — nothing in apps/portal
 * // ADR-019: audit event actor comes from verified session
 * // CS-TS-001: request-scoped DB via wrapper (seams are the boundary)
 * // CS-TS-002: no direct pool import
 * // CS-TS-003: attribute actions in apps/admin ONLY
 * // CS-TS-004: accountant-identity guard tested for every action
 * // CS-GEN-001: no note bodies in logs — tested by verifying seam params exclude audit body
 * // CS-GEN-003: cite governing authority in comments
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockSetEngagementDueDate,
  mockSetEngagementPriority,
  mockRecordEngagementNote,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockSetEngagementDueDate: vi.fn(),
  mockSetEngagementPriority: vi.fn(),
  mockRecordEngagementNote: vi.fn(),
  mockRevalidatePath: vi.fn(),
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

// Mock @tax-portal/db barrel — TASK-011-002 attribute seam functions
// ADR-003: these are the TASK-011-002 seam calls; we mock them at the action layer
// CS-TS-001 / CS-TS-002: verified by only mocking barrel imports (no raw pool mocks)
vi.mock("@tax-portal/db", () => ({
  setEngagementDueDate: mockSetEngagementDueDate,
  setEngagementPriority: mockSetEngagementPriority,
  recordEngagementNote: mockRecordEngagementNote,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  setDueDateAction,
  recordNoteAction,
  setPriorityAction,
} from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test",
  role: "CLIENT" as const,
};

const ENGAGEMENT_ID = "eng-011-aaaa-bbbb-cccc-000000000001";

// ─── Tests: identity guard — every action rejects non-ACCOUNTANT ──────────────
//
// [AC-LIFE-007-01][AC-LIFE-008-01][AC-LIFE-009-01] attribute writes must be
// rejected by the server-side guard before any DB write (ADR-003, CS-TS-004).

describe("[security] non-ACCOUNTANT identity is rejected by every attribute action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(null);
    // Seam mocks should NEVER be called when identity is rejected
    mockSetEngagementDueDate.mockResolvedValue({ success: true });
    mockSetEngagementPriority.mockResolvedValue({ success: true });
    mockRecordEngagementNote.mockResolvedValue({ success: true, noteId: "note-001" });
  });

  it("[AC-LIFE-007-01][security] setDueDateAction: null identity is rejected, no DB write", async () => {
    const result = await setDueDateAction(ENGAGEMENT_ID, "2026-12-31");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockSetEngagementDueDate).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-007-01][security] setDueDateAction: CLIENT role is rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await setDueDateAction(ENGAGEMENT_ID, "2026-12-31");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockSetEngagementDueDate).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-008-01][security] recordNoteAction: null identity is rejected, no DB write", async () => {
    const result = await recordNoteAction(ENGAGEMENT_ID, "Some internal note");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockRecordEngagementNote).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-008-01][security] recordNoteAction: CLIENT role is rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await recordNoteAction(ENGAGEMENT_ID, "Some internal note");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockRecordEngagementNote).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-009-01][security] setPriorityAction (flag): null identity is rejected, no DB write", async () => {
    const result = await setPriorityAction(ENGAGEMENT_ID, true);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockSetEngagementPriority).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-009-01][security] setPriorityAction (flag): CLIENT role is rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await setPriorityAction(ENGAGEMENT_ID, true);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockSetEngagementPriority).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-009-02][security] setPriorityAction (unflag): null identity is rejected, no DB write", async () => {
    const result = await setPriorityAction(ENGAGEMENT_ID, false);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockSetEngagementPriority).not.toHaveBeenCalled();
  });
});

// ─── Tests: setDueDateAction — happy path ─────────────────────────────────────
//
// [AC-LIFE-007-01] accountant sets a due date
// [AC-LIFE-007-02] accountant updates a due date

describe("[AC-LIFE-007-01] [AC-LIFE-007-02] setDueDateAction — accountant sets/updates due date", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockSetEngagementDueDate.mockResolvedValue({ success: true });
  });

  it("[AC-LIFE-007-01] returns { success: true } when ACCOUNTANT sets a due date", async () => {
    const result = await setDueDateAction(ENGAGEMENT_ID, "2026-12-31");

    expect(result.success).toBe(true);
    expect(mockSetEngagementDueDate).toHaveBeenCalledOnce();
    expect(mockSetEngagementDueDate).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        sourceSurface: "admin",
      }),
    );
  });

  it("[AC-LIFE-007-01] actor for ADR-019 audit event comes ONLY from verified session", async () => {
    await setDueDateAction(ENGAGEMENT_ID, "2026-12-31");

    // Actor must come from the verified session — not from action args
    expect(mockSetEngagementDueDate).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId, // ADR-019
        }),
      }),
    );
  });

  it("[AC-LIFE-007-02] returns { success: true } when ACCOUNTANT updates an existing due date", async () => {
    // Setting a new date when one already exists — same seam call, different date
    const result = await setDueDateAction(ENGAGEMENT_ID, "2027-03-15");

    expect(result.success).toBe(true);
    expect(mockSetEngagementDueDate).toHaveBeenCalledOnce();
  });

  it("[AC-LIFE-007-01] calls revalidatePath for the engagement page after success", async () => {
    await setDueDateAction(ENGAGEMENT_ID, "2026-12-31");

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining(ENGAGEMENT_ID),
    );
  });

  it("[AC-LIFE-007-01] returns { success: false } when seam returns { success: false }", async () => {
    mockSetEngagementDueDate.mockResolvedValue({ success: false });

    const result = await setDueDateAction(ENGAGEMENT_ID, "2026-12-31");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/could not|not found/i);
  });

  it("[AC-LIFE-007-01] returns { success: false } when engagementId is empty", async () => {
    const result = await setDueDateAction("", "2026-12-31");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/engagement|id/i);
    expect(mockSetEngagementDueDate).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-007-01] accepts null/empty dueDateStr to clear the due date", async () => {
    const result = await setDueDateAction(ENGAGEMENT_ID, null);

    expect(result.success).toBe(true);
    expect(mockSetEngagementDueDate).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: null }),
    );
  });

  it("[AC-LIFE-007-01] rejects an invalid date string", async () => {
    const result = await setDueDateAction(ENGAGEMENT_ID, "not-a-date");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/date|format/i);
    expect(mockSetEngagementDueDate).not.toHaveBeenCalled();
  });
});

// ─── Tests: recordNoteAction — happy path ─────────────────────────────────────
//
// [AC-LIFE-008-01] accountant records internal notes

describe("[AC-LIFE-008-01] recordNoteAction — accountant records internal notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockRecordEngagementNote.mockResolvedValue({ success: true, noteId: "note-001" });
  });

  it("[AC-LIFE-008-01] returns { success: true } when ACCOUNTANT records a note", async () => {
    const result = await recordNoteAction(ENGAGEMENT_ID, "Client needs additional W-2 forms.");

    expect(result.success).toBe(true);
    expect(mockRecordEngagementNote).toHaveBeenCalledOnce();
    expect(mockRecordEngagementNote).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        body: "Client needs additional W-2 forms.",
        createdBy: ACCOUNTANT_IDENTITY.clerkUserId,
        sourceSurface: "admin",
      }),
    );
  });

  it("[AC-LIFE-008-01] actor comes ONLY from verified session — not from action args (ADR-019)", async () => {
    await recordNoteAction(ENGAGEMENT_ID, "Some note");

    expect(mockRecordEngagementNote).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId, // ADR-019
          role: "ACCOUNTANT",
        }),
      }),
    );
  });

  it("[AC-LIFE-008-01] calls revalidatePath for the engagement page after success", async () => {
    await recordNoteAction(ENGAGEMENT_ID, "Some note");

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining(ENGAGEMENT_ID),
    );
  });

  it("[AC-LIFE-008-01] returns { success: false } when seam returns { success: false }", async () => {
    mockRecordEngagementNote.mockResolvedValue({ success: false });

    const result = await recordNoteAction(ENGAGEMENT_ID, "Some note");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/could not|not found/i);
  });

  it("[AC-LIFE-008-01] returns { success: false } when body is empty", async () => {
    const result = await recordNoteAction(ENGAGEMENT_ID, "");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/body|required|empty/i);
    expect(mockRecordEngagementNote).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-008-01] returns { success: false } when body is whitespace-only", async () => {
    const result = await recordNoteAction(ENGAGEMENT_ID, "   ");

    expect(result.success).toBe(false);
    expect(mockRecordEngagementNote).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-008-01] returns { success: false } when engagementId is empty", async () => {
    const result = await recordNoteAction("", "Some note");

    expect(result.success).toBe(false);
    expect(mockRecordEngagementNote).not.toHaveBeenCalled();
  });

  it("[CS-GEN-001] note body is NOT in the audit actor — seam receives it for storage only", async () => {
    // CS-GEN-001: The note body goes to the seam for DB storage in EngagementNote.body.
    // It is NOT written to the audit row by the seam (DECISION-011-E / engagement.note_recorded
    // audit action records only actor + engagementId, NOT the body).
    // This test verifies the action layer passes body to the seam, but the actor does not contain it.
    await recordNoteAction(ENGAGEMENT_ID, "Confidential note body");

    const call = mockRecordEngagementNote.mock.calls[0]?.[0];
    // body must be present (for DB storage)
    expect(call?.body).toBe("Confidential note body");
    // actor must NOT contain the note body
    const actorStr = JSON.stringify(call?.actor ?? {});
    expect(actorStr).not.toContain("Confidential note body");
  });
});

// ─── Tests: setPriorityAction — happy path ────────────────────────────────────
//
// [AC-LIFE-009-01] accountant flags an engagement as priority
// [AC-LIFE-009-02] accountant removes the flag/priority marker

describe("[AC-LIFE-009-01] [AC-LIFE-009-02] setPriorityAction — accountant flags/unflags priority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockSetEngagementPriority.mockResolvedValue({ success: true });
  });

  it("[AC-LIFE-009-01] returns { success: true } when ACCOUNTANT flags as priority (isPriority=true)", async () => {
    const result = await setPriorityAction(ENGAGEMENT_ID, true);

    expect(result.success).toBe(true);
    expect(mockSetEngagementPriority).toHaveBeenCalledOnce();
    expect(mockSetEngagementPriority).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        isPriority: true,
        sourceSurface: "admin",
      }),
    );
  });

  it("[AC-LIFE-009-02] returns { success: true } when ACCOUNTANT unflags (isPriority=false)", async () => {
    const result = await setPriorityAction(ENGAGEMENT_ID, false);

    expect(result.success).toBe(true);
    expect(mockSetEngagementPriority).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        isPriority: false,
        sourceSurface: "admin",
      }),
    );
  });

  it("[AC-LIFE-009-01] actor comes ONLY from verified session — not from action args (ADR-019)", async () => {
    await setPriorityAction(ENGAGEMENT_ID, true);

    expect(mockSetEngagementPriority).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId, // ADR-019
        }),
      }),
    );
  });

  it("[AC-LIFE-009-01] calls revalidatePath after successful flag", async () => {
    await setPriorityAction(ENGAGEMENT_ID, true);

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining(ENGAGEMENT_ID),
    );
  });

  it("[AC-LIFE-009-02] calls revalidatePath after successful unflag", async () => {
    await setPriorityAction(ENGAGEMENT_ID, false);

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining(ENGAGEMENT_ID),
    );
  });

  it("[AC-LIFE-009-01] returns { success: false } when seam returns { success: false }", async () => {
    mockSetEngagementPriority.mockResolvedValue({ success: false });

    const result = await setPriorityAction(ENGAGEMENT_ID, true);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/could not|not found/i);
  });

  it("[AC-LIFE-009-01] returns { success: false } when engagementId is empty", async () => {
    const result = await setPriorityAction("", true);

    expect(result.success).toBe(false);
    expect(mockSetEngagementPriority).not.toHaveBeenCalled();
  });
});
