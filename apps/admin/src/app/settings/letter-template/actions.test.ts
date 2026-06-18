/**
 * apps/admin/src/app/settings/letter-template/actions.test.ts
 *
 * Tier-2 unit tests for the letter-template server actions.
 *
 * AC-IDNT-007-01: getLetterTemplateAction returns the seeded system default on first read.
 * AC-IDNT-007-02: updateLetterTemplateAction persists edited content; re-read returns it.
 * Security: non-ACCOUNTANT identity is rejected from both actions (ADR-005).
 *
 * Strategy:
 *   - No real DB connection — getCurrentLetterTemplate and updateLetterTemplate are mocked.
 *   - withRequestContext is NOT in this module (admin-pool actions don't use it) but
 *     we still mock @tax-portal/db to control the repository return values.
 *   - Identity guard tested with null identity, CLIENT role, and valid ACCOUNTANT.
 *   - Mirrors apps/admin/src/app/services/actions.test.ts pattern.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LetterTemplateItem } from "@tax-portal/db";

// ─── Hoisted mock functions ───────────────────────────────────────────────────
//
// vi.hoisted() required because vi.mock() factories are hoisted before const declarations.

const { mockGetIdentity, mockGetCurrentLetterTemplate, mockUpdateLetterTemplate } =
  vi.hoisted(() => ({
    mockGetIdentity: vi.fn(),
    mockGetCurrentLetterTemplate: vi.fn(),
    mockUpdateLetterTemplate: vi.fn(),
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
  revalidatePath: vi.fn(),
}));

// Mock @tax-portal/auth — return a verified ACCOUNTANT identity by default
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

// Mock @tax-portal/db — stub the letter-template repository functions
vi.mock("@tax-portal/db", () => ({
  getCurrentLetterTemplate: mockGetCurrentLetterTemplate,
  updateLetterTemplate: mockUpdateLetterTemplate,
}));

// ─── Import after mocks are set up ────────────────────────────────────────────

import { getLetterTemplateAction, updateLetterTemplateAction } from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SYSTEM_DEFAULT_TEMPLATE: LetterTemplateItem = {
  id: "lt-001",
  content:
    "This Engagement Letter sets forth the terms and conditions under which [Firm Name] agrees to provide tax preparation services.",
  isSystemDefault: true,
  updatedBy: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const EDITED_TEMPLATE: LetterTemplateItem = {
  ...SYSTEM_DEFAULT_TEMPLATE,
  content: "This is the updated engagement letter content edited by the accountant.",
  isSystemDefault: false,
  updatedBy: "user_acct_test",
  updatedAt: new Date("2026-06-18T10:00:00Z"),
};

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test",
  role: "CLIENT" as const,
};

// ─── Tests: getLetterTemplateAction ──────────────────────────────────────────

describe("getLetterTemplateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetCurrentLetterTemplate.mockResolvedValue(SYSTEM_DEFAULT_TEMPLATE);
  });

  /**
   * [AC-IDNT-007-01] System default is returned on first read (seeded, no authoring required)
   */
  it("[AC-IDNT-007-01] returns success + system default template when ACCOUNTANT", async () => {
    const result = await getLetterTemplateAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toBeNull();
      expect(result.data?.isSystemDefault).toBe(true);
      expect(result.data?.content).toBe(SYSTEM_DEFAULT_TEMPLATE.content);
      // updatedBy is null for the system default
      expect(result.data?.updatedBy).toBeNull();
    }
    expect(mockGetCurrentLetterTemplate).toHaveBeenCalledOnce();
  });

  /**
   * [AC-IDNT-007-01] null on unseeded DB is passed through as data: null (defensive handling)
   */
  it("[AC-IDNT-007-01] returns success + null when DB is unseeded (no row)", async () => {
    mockGetCurrentLetterTemplate.mockResolvedValue(null);

    const result = await getLetterTemplateAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });

  /**
   * Security: null identity → unauthorized (ADR-005)
   */
  it("returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await getLetterTemplateAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockGetCurrentLetterTemplate).not.toHaveBeenCalled();
  });

  /**
   * Security: CLIENT role → unauthorized (ADR-005)
   */
  it("returns { success: false } when role is CLIENT (not ACCOUNTANT)", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await getLetterTemplateAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockGetCurrentLetterTemplate).not.toHaveBeenCalled();
  });
});

// ─── Tests: updateLetterTemplateAction ───────────────────────────────────────

describe("updateLetterTemplateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    // Default: successful update (1 row affected)
    mockUpdateLetterTemplate.mockResolvedValue({ rowsAffected: 1 });
  });

  /**
   * [AC-IDNT-007-02] Edit persists; re-read (via mock) would return edited content.
   * Verifies the action calls updateLetterTemplate with the correct content + accountantClerkId.
   */
  it("[AC-IDNT-007-02] calls updateLetterTemplate with the edited content + accountantClerkId", async () => {
    const newContent = "Updated engagement letter content.";
    const result = await updateLetterTemplateAction(newContent);

    expect(result.success).toBe(true);
    expect(mockUpdateLetterTemplate).toHaveBeenCalledWith({
      content: newContent,
      accountantClerkId: ACCOUNTANT_IDENTITY.clerkUserId,
    });
  });

  /**
   * [AC-IDNT-007-02] accountantClerkId is set from the verified session, not from arguments.
   * Confirms the identity.clerkUserId flows through to updateLetterTemplate.
   */
  it("[AC-IDNT-007-02] records the accountantClerkId from the verified session (not from input)", async () => {
    await updateLetterTemplateAction("Some new content");

    expect(mockUpdateLetterTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ accountantClerkId: "user_acct_test" }),
    );
    // Confirm the content is trimmed
    expect(mockUpdateLetterTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Some new content" }),
    );
  });

  /**
   * [AC-IDNT-007-02] Content is trimmed before persisting
   */
  it("trims whitespace from content before calling updateLetterTemplate", async () => {
    await updateLetterTemplateAction("  Trimmed content  ");

    expect(mockUpdateLetterTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Trimmed content" }),
    );
  });

  /**
   * rowsAffected === 0 → no row to update (unseeded DB) → failure result
   */
  it("returns { success: false } when rowsAffected is 0 (unseeded DB — no row to update)", async () => {
    mockUpdateLetterTemplate.mockResolvedValue({ rowsAffected: 0 });

    const result = await updateLetterTemplateAction("Some content");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/no template row/i);
    }
  });

  /**
   * Security: null identity → unauthorized
   */
  it("returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await updateLetterTemplateAction("Some content");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockUpdateLetterTemplate).not.toHaveBeenCalled();
  });

  /**
   * Security: CLIENT role → unauthorized (non-ACCOUNTANT rejected — key test)
   */
  it("returns { success: false } when role is CLIENT (not ACCOUNTANT) — non-ACCOUNTANT rejected", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await updateLetterTemplateAction("Some content");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockUpdateLetterTemplate).not.toHaveBeenCalled();
  });

  /**
   * Input validation: empty content → failure
   */
  it("returns { success: false } when content is an empty string", async () => {
    const result = await updateLetterTemplateAction("");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/required/i);
    }
    expect(mockUpdateLetterTemplate).not.toHaveBeenCalled();
  });

  /**
   * Input validation: whitespace-only content → failure
   */
  it("returns { success: false } when content is whitespace-only", async () => {
    const result = await updateLetterTemplateAction("   ");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/required/i);
    }
    expect(mockUpdateLetterTemplate).not.toHaveBeenCalled();
  });

  /**
   * Simulate persistence — get after update returns new content (mocked)
   *
   * AC-IDNT-007-02: edit persists; re-read returns edited content.
   * We simulate this by: (1) calling updateLetterTemplateAction, (2) mocking
   * getCurrentLetterTemplate to return the edited content, (3) calling
   * getLetterTemplateAction and asserting the new content is returned.
   */
  it("[AC-IDNT-007-02] re-read after update returns the edited content (mocked persistence)", async () => {
    // Step 1: Update
    const newContent = EDITED_TEMPLATE.content;
    await updateLetterTemplateAction(newContent);

    // Step 2: Re-read — mock returns the edited template
    mockGetCurrentLetterTemplate.mockResolvedValue(EDITED_TEMPLATE);
    const readResult = await getLetterTemplateAction();

    expect(readResult.success).toBe(true);
    if (readResult.success) {
      expect(readResult.data?.content).toBe(newContent);
      expect(readResult.data?.isSystemDefault).toBe(false);
      expect(readResult.data?.updatedBy).toBe(ACCOUNTANT_IDENTITY.clerkUserId);
    }
  });
});
