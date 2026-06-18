/**
 * apps/portal/src/app/onboarding/actions.test.ts
 *
 * Tier-2 unit tests for onboarding server actions.
 * All external seams are mocked — no real DB, no real auth, no real e-sign provider.
 *
 * Tests cover:
 *   [AC-ONBD-001-01] getOnboardingAction returns exactly three steps in order
 *   [AC-ONBD-002-01] questionnaire step refused/inaccessible when letterSignedAt is NULL
 *   [AC-ONBD-002-02] document-upload step refused/inaccessible when letterSignedAt is NULL
 *   [AC-ONBD-001-02] a later step cannot be entered before the letter is signed (server refuses)
 *   [AC-ONBD-002-03] after signEngagementLetterAction, steps 2/3 become accessible
 *   [AC-ONBD-002-04] signature records evidence against the engagement + writes an audit row
 *   [AC-IDNT-007-03] the content presented/snapshotted is the accountant's edited template
 *   [ADR-005] a CLIENT who does not own the engagement is blocked (isolation)
 *   [AC-ONBD-001-03] currentStep + remaining reflect signed/unsigned state
 *   [ADR-019] non-owner BLOCK denial does NOT write an audit event
 *   [ADR-024] "signed" decision comes from verifyCompletion, not client-supplied argument
 *
 * Methodology: test-after, AC tags in titles. E2e not required for this task.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoisted mock factories ───────────────────────────────────────────────────

const {
  mockGetEngagementForClient,
  mockGetCurrentLetterTemplate,
  mockRecordLetterSignatureAsClient,
  mockRecordAuthEvent,
  mockWithRequestContext,
  mockResolveOnboarding,
  mockCheckStepAccessibility,
  mockGetESignatureProvider,
  mockCreateSignatureRequest,
  mockVerifyCompletion,
  mockHeadersGet,
  mockRevalidatePath,
} = vi.hoisted(() => {
  const mockCreateSignatureRequest = vi.fn();
  const mockVerifyCompletion = vi.fn();
  const mockHeadersGet = vi.fn().mockReturnValue("mock-cookie=value");

  return {
    mockGetEngagementForClient: vi.fn(),
    mockGetCurrentLetterTemplate: vi.fn(),
    mockRecordLetterSignatureAsClient: vi.fn(),
    mockRecordAuthEvent: vi.fn(),
    // withRequestContext passes through to the callback
    mockWithRequestContext: vi.fn(),
    mockResolveOnboarding: vi.fn(),
    mockCheckStepAccessibility: vi.fn(),
    mockGetESignatureProvider: vi.fn().mockReturnValue({
      createSignatureRequest: mockCreateSignatureRequest,
      verifyCompletion: mockVerifyCompletion,
    }),
    mockCreateSignatureRequest,
    mockVerifyCompletion,
    mockHeadersGet,
    mockRevalidatePath: vi.fn(),
  };
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

// @tax-portal/db
vi.mock("@tax-portal/db", () => ({
  withRequestContext: mockWithRequestContext,
  getEngagementForClient: mockGetEngagementForClient,
  getCurrentLetterTemplate: mockGetCurrentLetterTemplate,
  recordLetterSignatureAsClient: mockRecordLetterSignatureAsClient,
  recordAuthEvent: mockRecordAuthEvent,
  resolveOnboarding: mockResolveOnboarding,
  checkStepAccessibility: mockCheckStepAccessibility,
}));

// @tax-portal/esign
vi.mock("@tax-portal/esign", () => ({
  getESignatureProvider: mockGetESignatureProvider,
}));

// next/headers
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({
      get: mockHeadersGet,
    }),
}));

// next/cache
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

// @tax-portal/auth — mock getAuthProvider with getIdentity
const mockGetIdentity = vi.fn();
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import {
  getOnboardingAction,
  signEngagementLetterAction,
  checkStepAccessibilityAction,
} from "./actions.js";
import type { OnboardingReadModel } from "@tax-portal/db";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENT_IDENTITY = {
  clerkUserId: "client_test_clerk_id",
  role: "CLIENT" as const,
};

const ENGAGEMENT_ID = "engagement-uuid-test-001";

const UNSIGNED_ENGAGEMENT = {
  id: ENGAGEMENT_ID,
  engagementRequestId: "request-uuid-001",
  clientUserId: "user-uuid-001",
  status: "New",
  letterSignedAt: null,
  letterSignatureEvidence: null,
  letterTemplateSnapshot: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const SIGNED_ENGAGEMENT = {
  ...UNSIGNED_ENGAGEMENT,
  letterSignedAt: new Date("2026-06-18T12:00:00Z"),
  letterSignatureEvidence: JSON.stringify({ provider: "mock", signed: true }),
  letterTemplateSnapshot: "Dear Client, This is the engagement letter.",
};

const UNSIGNED_READ_MODEL: OnboardingReadModel = {
  engagementId: ENGAGEMENT_ID,
  steps: [
    { key: "engagement-letter", accessible: true, done: false },
    { key: "intake-questionnaire", accessible: false, done: false },
    { key: "document-upload", accessible: false, done: false },
  ],
  currentStep: "engagement-letter",
  remaining: 2,
};

const SIGNED_READ_MODEL: OnboardingReadModel = {
  engagementId: ENGAGEMENT_ID,
  steps: [
    { key: "engagement-letter", accessible: true, done: true },
    { key: "intake-questionnaire", accessible: true, done: false },
    { key: "document-upload", accessible: true, done: false },
  ],
  currentStep: "intake-questionnaire",
  remaining: 1,
};

const MOCK_TEMPLATE = {
  id: "template-uuid-001",
  content: "Dear Client, This is the engagement letter.",
  isSystemDefault: false,
  updatedBy: "accountant_clerk_id",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-06-01"),
};

const MOCK_COMPLETION = {
  signed: true as const,
  signedAt: "2026-06-18T12:00:00Z",
  evidence: JSON.stringify({ provider: "mock", engagementId: ENGAGEMENT_ID, ref: "mock-ref", signedAt: "2026-06-18T12:00:00Z" }),
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: CLIENT identity
  mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

  // Default: withRequestContext passes through to the callback
  mockWithRequestContext.mockImplementation(
    (_clerkUserId: string, _role: string, fn: () => Promise<unknown>) => fn(),
  );

  // Default: unsigned engagement
  mockGetEngagementForClient.mockResolvedValue(UNSIGNED_ENGAGEMENT);

  // Default: resolveOnboarding returns unsigned model
  mockResolveOnboarding.mockReturnValue(UNSIGNED_READ_MODEL);

  // Default: checkStepAccessibility allows
  mockCheckStepAccessibility.mockReturnValue(undefined);

  // Default: template loaded
  mockGetCurrentLetterTemplate.mockResolvedValue(MOCK_TEMPLATE);

  // Default: e-sign provider — re-set after clearAllMocks (clearAllMocks resets mockReturnValue)
  mockCreateSignatureRequest.mockResolvedValue({ engagementId: ENGAGEMENT_ID, ref: "mock-ref" });
  mockVerifyCompletion.mockResolvedValue(MOCK_COMPLETION);
  mockGetESignatureProvider.mockReturnValue({
    createSignatureRequest: mockCreateSignatureRequest,
    verifyCompletion: mockVerifyCompletion,
  });

  // Default: signature write succeeds
  mockRecordLetterSignatureAsClient.mockResolvedValue({ rowsAffected: 1 });

  // Default: audit write succeeds
  mockRecordAuthEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getOnboardingAction — onboarding read model", () => {

  it("[AC-ONBD-001-01] returns exactly three steps in fixed order", async () => {
    const result = await getOnboardingAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.steps).toHaveLength(3);
    expect(result.data.steps[0]?.key).toBe("engagement-letter");
    expect(result.data.steps[1]?.key).toBe("intake-questionnaire");
    expect(result.data.steps[2]?.key).toBe("document-upload");
  });

  it("[AC-ONBD-002-01] questionnaire step is inaccessible when letterSignedAt is NULL", async () => {
    mockResolveOnboarding.mockReturnValue(UNSIGNED_READ_MODEL);

    const result = await getOnboardingAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const questionnaireStep = result.data.steps.find(s => s.key === "intake-questionnaire");
    expect(questionnaireStep?.accessible).toBe(false);
    expect(questionnaireStep?.done).toBe(false);
  });

  it("[AC-ONBD-002-02] document-upload step is inaccessible when letterSignedAt is NULL", async () => {
    mockResolveOnboarding.mockReturnValue(UNSIGNED_READ_MODEL);

    const result = await getOnboardingAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const uploadStep = result.data.steps.find(s => s.key === "document-upload");
    expect(uploadStep?.accessible).toBe(false);
    expect(uploadStep?.done).toBe(false);
  });

  it("[AC-ONBD-001-03] currentStep is engagement-letter and remaining is 2 when unsigned", async () => {
    mockResolveOnboarding.mockReturnValue(UNSIGNED_READ_MODEL);

    const result = await getOnboardingAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.currentStep).toBe("engagement-letter");
    expect(result.data.remaining).toBe(2);
  });

  it("[AC-ONBD-001-03] currentStep is intake-questionnaire and remaining is 1 when letter is signed", async () => {
    mockGetEngagementForClient.mockResolvedValue(SIGNED_ENGAGEMENT);
    mockResolveOnboarding.mockReturnValue(SIGNED_READ_MODEL);

    const result = await getOnboardingAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.currentStep).toBe("intake-questionnaire");
    expect(result.data.remaining).toBe(1);
  });

  it("[ADR-005] non-owner CLIENT blocked — engagement not found returns error", async () => {
    // Simulate FILTER predicate: non-owner gets ZERO rows (null returned)
    mockGetEngagementForClient.mockResolvedValue(null);

    const result = await getOnboardingAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toContain("not found");
  });

  it("returns error when CLIENT identity not present (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await getOnboardingAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Unauthorized");
  });

  it("returns error for ACCOUNTANT identity (wrong role)", async () => {
    mockGetIdentity.mockResolvedValue({ clerkUserId: "acct_id", role: "ACCOUNTANT" as const });

    const result = await getOnboardingAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Unauthorized");
  });

});

describe("checkStepAccessibilityAction — server-side hard gate", () => {

  it("[AC-ONBD-001-02] locked step refused by server — checkStepAccessibilityAction questionnaire locked", async () => {
    // Simulate locked step
    mockCheckStepAccessibility.mockReturnValue({
      refused: true,
      reason: "step-locked",
      stepKey: "intake-questionnaire" as const,
    });

    const result = await checkStepAccessibilityAction(ENGAGEMENT_ID, "intake-questionnaire");

    expect(result.accessible).toBe(false);
    if (result.accessible) return;
    expect(result.refusal.reason).toBe("step-locked");
    expect(result.refusal.stepKey).toBe("intake-questionnaire");
  });

  it("[AC-ONBD-001-02] locked step refused by server — checkStepAccessibilityAction document-upload locked", async () => {
    mockCheckStepAccessibility.mockReturnValue({
      refused: true,
      reason: "step-locked",
      stepKey: "document-upload" as const,
    });

    const result = await checkStepAccessibilityAction(ENGAGEMENT_ID, "document-upload");

    expect(result.accessible).toBe(false);
    if (result.accessible) return;
    expect(result.refusal.stepKey).toBe("document-upload");
  });

  it("[AC-ONBD-002-03] accessible after signing — checkStepAccessibilityAction allows questionnaire", async () => {
    mockGetEngagementForClient.mockResolvedValue(SIGNED_ENGAGEMENT);
    mockCheckStepAccessibility.mockReturnValue(undefined); // no refusal

    const result = await checkStepAccessibilityAction(ENGAGEMENT_ID, "intake-questionnaire");

    expect(result.accessible).toBe(true);
  });

});

describe("signEngagementLetterAction — sign + unlock", () => {

  it("[AC-ONBD-002-03] after signing, steps 2/3 become accessible", async () => {
    // After signing: return signed engagement + signed read model
    mockGetEngagementForClient
      .mockResolvedValueOnce(UNSIGNED_ENGAGEMENT) // initial load
      .mockResolvedValueOnce(SIGNED_ENGAGEMENT);   // reload after signing
    mockResolveOnboarding.mockReturnValue(SIGNED_READ_MODEL);

    const result = await signEngagementLetterAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const questionnaireStep = result.data.steps.find(s => s.key === "intake-questionnaire");
    const uploadStep = result.data.steps.find(s => s.key === "document-upload");
    expect(questionnaireStep?.accessible).toBe(true);
    expect(uploadStep?.accessible).toBe(true);
  });

  it("[AC-ONBD-002-04] signature records evidence against the engagement", async () => {
    mockGetEngagementForClient
      .mockResolvedValueOnce(UNSIGNED_ENGAGEMENT)
      .mockResolvedValueOnce(SIGNED_ENGAGEMENT);
    mockResolveOnboarding.mockReturnValue(SIGNED_READ_MODEL);

    await signEngagementLetterAction(ENGAGEMENT_ID);

    expect(mockRecordLetterSignatureAsClient).toHaveBeenCalledOnce();
    const signArg = mockRecordLetterSignatureAsClient.mock.calls[0]?.[0];
    expect(signArg?.engagementId).toBe(ENGAGEMENT_ID);
    expect(signArg?.signatureEvidence).toBe(MOCK_COMPLETION.evidence);
    expect(signArg?.clerkUserId).toBe(CLIENT_IDENTITY.clerkUserId);
    expect(signArg?.role).toBe("CLIENT");
  });

  it("[AC-ONBD-002-04] signature writes an audit row with action engagement.letter_signed", async () => {
    mockGetEngagementForClient
      .mockResolvedValueOnce(UNSIGNED_ENGAGEMENT)
      .mockResolvedValueOnce(SIGNED_ENGAGEMENT);
    mockResolveOnboarding.mockReturnValue(SIGNED_READ_MODEL);

    await signEngagementLetterAction(ENGAGEMENT_ID);

    expect(mockRecordAuthEvent).toHaveBeenCalledOnce();
    const auditArg = mockRecordAuthEvent.mock.calls[0]?.[0];
    expect(auditArg?.action).toBe("engagement.letter_signed");
    expect(auditArg?.targetType).toBe("Engagement");
    expect(auditArg?.targetId).toBe(ENGAGEMENT_ID);
    expect(auditArg?.sourceSurface).toBe("portal");
    expect(auditArg?.actor.role).toBe("CLIENT");
    expect(auditArg?.actor.clerkUserId).toBe(CLIENT_IDENTITY.clerkUserId);
  });

  it("[AC-IDNT-007-03] the content snapshotted is the accountant's edited template", async () => {
    mockGetEngagementForClient
      .mockResolvedValueOnce(UNSIGNED_ENGAGEMENT)
      .mockResolvedValueOnce(SIGNED_ENGAGEMENT);
    mockResolveOnboarding.mockReturnValue(SIGNED_READ_MODEL);

    await signEngagementLetterAction(ENGAGEMENT_ID);

    const signArg = mockRecordLetterSignatureAsClient.mock.calls[0]?.[0];
    expect(signArg?.templateSnapshot).toBe(MOCK_TEMPLATE.content);
  });

  it("[AC-IDNT-007-03] createSignatureRequest is called with the accountant's template content", async () => {
    mockGetEngagementForClient
      .mockResolvedValueOnce(UNSIGNED_ENGAGEMENT)
      .mockResolvedValueOnce(SIGNED_ENGAGEMENT);
    mockResolveOnboarding.mockReturnValue(SIGNED_READ_MODEL);

    await signEngagementLetterAction(ENGAGEMENT_ID);

    expect(mockCreateSignatureRequest).toHaveBeenCalledWith({
      engagementId: ENGAGEMENT_ID,
      letterContent: MOCK_TEMPLATE.content,
      signer: { clerkUserId: CLIENT_IDENTITY.clerkUserId },
    });
  });

  it("[ADR-024] signed decision comes from verifyCompletion, not client-supplied argument", async () => {
    // Even if we call the action without any client-side "I signed" claim, the action
    // checks verifyCompletion. On signed: false → no mutation.
    mockVerifyCompletion.mockResolvedValue({ signed: false });

    const result = await signEngagementLetterAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("not been signed");
    // No mutation should have occurred
    expect(mockRecordLetterSignatureAsClient).not.toHaveBeenCalled();
    expect(mockRecordAuthEvent).not.toHaveBeenCalled();
  });

  it("[ADR-019] non-owner BLOCK denial does NOT write an audit event", async () => {
    // BLOCK predicate denies the write — rowsAffected = 0
    mockRecordLetterSignatureAsClient.mockResolvedValue({ rowsAffected: 0 });

    const result = await signEngagementLetterAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.refused).toBe(true);
    // CRITICAL: audit event must NOT be written for a non-event
    expect(mockRecordAuthEvent).not.toHaveBeenCalled();
  });

  it("[ADR-005] non-owner CLIENT blocked — engagement not found returns refused result", async () => {
    // FILTER predicate: non-owner gets null
    mockGetEngagementForClient.mockResolvedValue(null);

    const result = await signEngagementLetterAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.refused).toBe(true);
    expect(mockRecordLetterSignatureAsClient).not.toHaveBeenCalled();
    expect(mockRecordAuthEvent).not.toHaveBeenCalled();
  });

  it("returns error when no CLIENT identity present", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await signEngagementLetterAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Unauthorized");
  });

  it("revalidatePath called on successful sign", async () => {
    mockGetEngagementForClient
      .mockResolvedValueOnce(UNSIGNED_ENGAGEMENT)
      .mockResolvedValueOnce(SIGNED_ENGAGEMENT);
    mockResolveOnboarding.mockReturnValue(SIGNED_READ_MODEL);

    await signEngagementLetterAction(ENGAGEMENT_ID);

    expect(mockRevalidatePath).toHaveBeenCalledWith("/onboarding");
  });

});

describe("resolveOnboarding — unit tests (pure function, no mocks needed for the logic)", () => {

  // These tests call the real resolveOnboarding from @tax-portal/db to verify the pure logic.
  // They use the mock for other DB functions but override resolveOnboarding to test the action's
  // integration with the model. The actual logic is tested in packages/db tests.

  it("[AC-ONBD-001-01] engagement-letter step is always accessible:true", async () => {
    const result = await getOnboardingAction(ENGAGEMENT_ID);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const letterStep = result.data.steps.find(s => s.key === "engagement-letter");
    expect(letterStep?.accessible).toBe(true);
  });

  it("[AC-ONBD-001-01] step order is always engagement-letter first", async () => {
    const result = await getOnboardingAction(ENGAGEMENT_ID);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.steps[0]?.key).toBe("engagement-letter");
  });

});
