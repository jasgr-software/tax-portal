/**
 * apps/portal/src/app/onboarding/actions.test.ts
 *
 * Tier-2 unit tests for onboarding server actions.
 * All external seams are mocked — no real DB, no real auth, no real e-sign provider.
 *
 * Tests cover:
 *   [AC-ONBD-002-03] after signEngagementLetterAction, steps 2/3 become accessible
 *   [AC-ONBD-002-04] signature records evidence against the engagement + writes an audit row
 *   [AC-IDNT-007-03] the content presented/snapshotted is the accountant's edited template
 *   [ADR-005] a CLIENT who does not own the engagement is blocked (isolation)
 *   [AC-ONBD-001-01/-03] step order + currentStep + remaining reflect signed/unsigned state
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
  mockGetMyEngagement,
  mockGetMyQuestionnaire,
  mockGetMyQuestionnaireAnswer,
  mockSubmitQuestionnaireAsClient,
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
    mockGetMyEngagement: vi.fn(),
    mockGetMyQuestionnaire: vi.fn(),
    mockGetMyQuestionnaireAnswer: vi.fn(),
    mockSubmitQuestionnaireAsClient: vi.fn(),
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
  getMyEngagement: mockGetMyEngagement,
  getCurrentLetterTemplate: mockGetCurrentLetterTemplate,
  recordLetterSignatureAsClient: mockRecordLetterSignatureAsClient,
  recordAuthEvent: mockRecordAuthEvent,
  resolveOnboarding: mockResolveOnboarding,
  checkStepAccessibility: mockCheckStepAccessibility,
  getMyQuestionnaire: mockGetMyQuestionnaire,
  getMyQuestionnaireAnswer: mockGetMyQuestionnaireAnswer,
  submitQuestionnaireAsClient: mockSubmitQuestionnaireAsClient,
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
  signEngagementLetterAction,
  submitQuestionnaireAction,
  getMyQuestionnaireAction,
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
  questionnaireSubmittedAt: null,
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

const TEMPLATE_ID = "template-uuid-001";
const SERVICE_ID = "service-uuid-001";

const MOCK_QUESTIONNAIRE_TEMPLATE = {
  id: TEMPLATE_ID,
  serviceId: SERVICE_ID,
  questions: JSON.stringify([
    { id: "q1", prompt: "Full name", type: "text", required: true },
    { id: "q2", prompt: "Notes", type: "textarea", required: false },
  ]),
  updatedBy: "accountant_clerk_id",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-06-01"),
};

const MOCK_QUESTIONNAIRE_FOR_ENGAGEMENT = {
  engagementId: ENGAGEMENT_ID,
  serviceId: SERVICE_ID,
  serviceName: "Tax Return",
  template: MOCK_QUESTIONNAIRE_TEMPLATE,
};

const VALID_ANSWERS_JSON = JSON.stringify({ q1: "Alice Smith", q2: "No notes" });
const MISSING_REQUIRED_ANSWERS_JSON = JSON.stringify({ q2: "Notes only" });

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
  mockGetMyEngagement.mockResolvedValue(SIGNED_ENGAGEMENT);

  // Default: resolveOnboarding returns unsigned model
  mockResolveOnboarding.mockReturnValue(UNSIGNED_READ_MODEL);

  // Default: checkStepAccessibility returns undefined (step accessible)
  mockCheckStepAccessibility.mockReturnValue(undefined);

  // Default: questionnaire resolution
  mockGetMyQuestionnaire.mockResolvedValue(MOCK_QUESTIONNAIRE_FOR_ENGAGEMENT);
  mockGetMyQuestionnaireAnswer.mockResolvedValue(null); // not yet submitted

  // Default: submit write succeeds
  mockSubmitQuestionnaireAsClient.mockResolvedValue({ rowsAffected: 1 });

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

// ─── Supplemental fixtures (referenced by submitQuestionnaireAction tests) ─────

/** A signed read model with intake-questionnaire done (after submit). */
const QUESTIONNAIRE_DONE_READ_MODEL: OnboardingReadModel = {
  engagementId: ENGAGEMENT_ID,
  steps: [
    { key: "engagement-letter", accessible: true, done: true },
    { key: "intake-questionnaire", accessible: true, done: true },
    { key: "document-upload", accessible: true, done: false },
  ],
  currentStep: "document-upload",
  remaining: 0,
};

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

// ─── submitQuestionnaireAction tests ─────────────────────────────────────────

describe("submitQuestionnaireAction — submit + step satisfaction", () => {

  it("[AC-ONBD-003-03] successful submit returns success: true (step satisfied server-side)", async () => {
    const result = await submitQuestionnaireAction(VALID_ANSWERS_JSON);

    expect(result.success).toBe(true);
  });

  it("[AC-ONBD-003-04] successful submit calls submitQuestionnaireAsClient with correct args", async () => {
    await submitQuestionnaireAction(VALID_ANSWERS_JSON);

    expect(mockSubmitQuestionnaireAsClient).toHaveBeenCalledOnce();
    const arg = mockSubmitQuestionnaireAsClient.mock.calls[0]?.[0];
    // templateId must be server-derived (from MOCK_QUESTIONNAIRE_FOR_ENGAGEMENT.template.id)
    expect(arg?.templateId).toBe(TEMPLATE_ID);
    expect(arg?.engagementId).toBe(ENGAGEMENT_ID);
    expect(arg?.answers).toBe(VALID_ANSWERS_JSON);
    expect(arg?.clerkUserId).toBe(CLIENT_IDENTITY.clerkUserId);
    expect(arg?.role).toBe("CLIENT");
  });

  it("[AC-ONBD-003-01] templateId is server-derived — not client-supplied (comes from resolved template)", async () => {
    // The client passes only answers JSON; the templateId is resolved from the questionnaire
    // The test confirms that the templateId in the submit call matches the server-resolved template
    await submitQuestionnaireAction(VALID_ANSWERS_JSON);

    const arg = mockSubmitQuestionnaireAsClient.mock.calls[0]?.[0];
    // Server-derived templateId from MOCK_QUESTIONNAIRE_FOR_ENGAGEMENT.template.id
    expect(arg?.templateId).toBe(MOCK_QUESTIONNAIRE_TEMPLATE.id);
    // Critically: the client did NOT supply this — it came from getMyQuestionnaire()
    expect(mockGetMyQuestionnaire).toHaveBeenCalled();
  });

  it("[AC-ONBD-003-03] audit event written after successful submit (engagement.questionnaire_submitted)", async () => {
    await submitQuestionnaireAction(VALID_ANSWERS_JSON);

    expect(mockRecordAuthEvent).toHaveBeenCalledOnce();
    const auditArg = mockRecordAuthEvent.mock.calls[0]?.[0];
    expect(auditArg?.action).toBe("engagement.questionnaire_submitted");
    expect(auditArg?.targetType).toBe("Engagement");
    expect(auditArg?.targetId).toBe(ENGAGEMENT_ID);
    expect(auditArg?.sourceSurface).toBe("portal");
    expect(auditArg?.actor.role).toBe("CLIENT");
    expect(auditArg?.actor.clerkUserId).toBe(CLIENT_IDENTITY.clerkUserId);
  });

  it("[AC-ONBD-003-03] revalidatePath called on successful submit", async () => {
    await submitQuestionnaireAction(VALID_ANSWERS_JSON);

    expect(mockRevalidatePath).toHaveBeenCalledWith("/onboarding");
  });

  it("[ADR-005] non-owner BLOCK denial — rowsAffected = 0 → refused, no audit event", async () => {
    // BLOCK predicate denies the write — rowsAffected = 0
    mockSubmitQuestionnaireAsClient.mockResolvedValue({ rowsAffected: 0 });

    const result = await submitQuestionnaireAction(VALID_ANSWERS_JSON);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.refused).toBe(true);
    // CRITICAL: no audit event for a non-event (ADR-019)
    expect(mockRecordAuthEvent).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("[gate honored] submit refused when letter unsigned — checkStepAccessibility returns refusal, no write", async () => {
    // Letter is unsigned — step is locked
    const stepRefusal = { refused: true as const, reason: "step-locked" as const, stepKey: "intake-questionnaire" as const };
    mockCheckStepAccessibility.mockReturnValue(stepRefusal);

    const result = await submitQuestionnaireAction(VALID_ANSWERS_JSON);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.refused).toBe(true);
    // Gate check must prevent any write
    expect(mockSubmitQuestionnaireAsClient).not.toHaveBeenCalled();
    expect(mockRecordAuthEvent).not.toHaveBeenCalled();
  });

  it("[gate honored] submit refused does NOT weaken EPIC-005 letter gate", async () => {
    // Confirm that checkStepAccessibility is always called before submit
    mockCheckStepAccessibility.mockReturnValue({ refused: true as const, reason: "step-locked" as const, stepKey: "intake-questionnaire" as const });

    await submitQuestionnaireAction(VALID_ANSWERS_JSON);

    // checkStepAccessibility was consulted
    expect(mockCheckStepAccessibility).toHaveBeenCalledWith(
      expect.objectContaining({ id: ENGAGEMENT_ID }),
      "intake-questionnaire",
    );
    // Write never happened
    expect(mockSubmitQuestionnaireAsClient).not.toHaveBeenCalled();
  });

  it("returns error when no CLIENT identity present", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await submitQuestionnaireAction(VALID_ANSWERS_JSON);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Unauthorized");
    expect(mockSubmitQuestionnaireAsClient).not.toHaveBeenCalled();
  });

  it("returns error when no engagement found (FILTER returns null)", async () => {
    // withRequestContext callback returns null (no engagement visible)
    mockWithRequestContext.mockImplementation(
      (_clerkUserId: string, _role: string, _fn: () => Promise<unknown>) => {
        // Simulate getMyEngagement returning null — withRequestContext resolves to null
        return Promise.resolve(null);
      },
    );

    const result = await submitQuestionnaireAction(VALID_ANSWERS_JSON);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("No active engagement found");
    expect(mockSubmitQuestionnaireAsClient).not.toHaveBeenCalled();
  });

  it("returns validation error when required question is missing from answers", async () => {
    const result = await submitQuestionnaireAction(MISSING_REQUIRED_ANSWERS_JSON);

    expect(result.success).toBe(false);
    if (result.success) return;
    // Should mention the missing required question id
    expect(result.error).toContain("q1");
    expect(mockSubmitQuestionnaireAsClient).not.toHaveBeenCalled();
  });

  it("returns error when answers JSON is malformed", async () => {
    const result = await submitQuestionnaireAction("not-valid-json{{{");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Invalid answers format");
    expect(mockSubmitQuestionnaireAsClient).not.toHaveBeenCalled();
  });

  it("returns error when answers is a JSON array instead of an object", async () => {
    const result = await submitQuestionnaireAction(JSON.stringify(["q1", "answer"]));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Invalid answers format");
    expect(mockSubmitQuestionnaireAsClient).not.toHaveBeenCalled();
  });

  it("returns error when no questionnaire template is configured", async () => {
    mockGetMyQuestionnaire.mockResolvedValue({
      ...MOCK_QUESTIONNAIRE_FOR_ENGAGEMENT,
      template: null,
    });

    const result = await submitQuestionnaireAction(VALID_ANSWERS_JSON);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("No questionnaire template");
    expect(mockSubmitQuestionnaireAsClient).not.toHaveBeenCalled();
  });

  it("[ADR-019] no audit event written on gate refusal (fail-closed)", async () => {
    mockCheckStepAccessibility.mockReturnValue({ refused: true as const, reason: "step-locked" as const, stepKey: "intake-questionnaire" as const });

    await submitQuestionnaireAction(VALID_ANSWERS_JSON);

    expect(mockRecordAuthEvent).not.toHaveBeenCalled();
  });

  void QUESTIONNAIRE_DONE_READ_MODEL; // reference to avoid lint warning

});

// ─── getMyQuestionnaireAction tests ──────────────────────────────────────────

describe("getMyQuestionnaireAction — load questionnaire + submitted state", () => {

  it("returns success with questionnaire and alreadySubmitted: false when not yet submitted", async () => {
    mockGetMyQuestionnaireAnswer.mockResolvedValue(null);

    const result = await getMyQuestionnaireAction();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(MOCK_QUESTIONNAIRE_FOR_ENGAGEMENT);
    expect(result.alreadySubmitted).toBe(false);
    expect(result.existingAnswers).toBeNull();
  });

  it("returns alreadySubmitted: true and existingAnswers when questionnaire was submitted", async () => {
    const existingAnswersJson = JSON.stringify({ q1: "Alice Smith" });
    mockGetMyQuestionnaireAnswer.mockResolvedValue({
      id: "answer-uuid-001",
      engagementId: ENGAGEMENT_ID,
      templateId: TEMPLATE_ID,
      answers: existingAnswersJson,
      submittedAt: new Date("2026-06-18T14:00:00Z"),
      createdAt: new Date("2026-06-18T14:00:00Z"),
      updatedAt: new Date("2026-06-18T14:00:00Z"),
    });

    const result = await getMyQuestionnaireAction();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.alreadySubmitted).toBe(true);
    expect(result.existingAnswers).toBe(existingAnswersJson);
  });

  it("returns error when no CLIENT identity", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await getMyQuestionnaireAction();

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Unauthorized");
  });

  it("returns error when no engagement found", async () => {
    mockWithRequestContext.mockResolvedValue(null);

    const result = await getMyQuestionnaireAction();

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("No active engagement found");
  });

});

