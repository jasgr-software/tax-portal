/**
 * apps/admin/src/app/settings/questionnaire-templates/actions.test.ts
 *
 * Unit tests for the questionnaire-template server actions.
 *
 * AC-DASH-012-01: upsertQuestionnaireTemplateAction creates a new template for a service type.
 * AC-DASH-012-02: Template is bound to the selected serviceId (passed through to the repository).
 * AC-DASH-012-03: upsertQuestionnaireTemplateAction updates an existing template; re-read returns edited content.
 * AC-ONBD-003-02: Two service types carry distinct templates; no cross-contamination.
 * Security (ADR-005): Non-accountant identity is rejected; accountantClerkId comes only from the
 *   verified session — never from action arguments or form data.
 *
 * Strategy:
 *   - No real DB connection — all repository calls are mocked.
 *   - Identity guard tested with null identity, CLIENT role, and valid ACCOUNTANT.
 *   - Mirrors apps/admin/src/app/settings/letter-template/actions.test.ts pattern.
 *   - withRequestContext is mocked with a pass-through (listServicesForTemplatesAction wraps
 *     listAllServices() in withRequestContext per ADR-003 SESSION_CONTEXT requirement).
 *
 * ADR-006: Template management is apps/admin ONLY — no portal surface.
 * ADR-005: accountantClerkId sourced exclusively from verified session.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QuestionnaireTemplateItem, QuestionDef } from "@tax-portal/db";

// ─── Hoisted mock functions ───────────────────────────────────────────────────
//
// vi.hoisted() required because vi.mock() factories are hoisted before const declarations.

const {
  mockGetIdentity,
  mockGetTemplateForService,
  mockUpsertTemplateForService,
  mockListAllServices,
  mockRevalidatePath,
  mockWithRequestContext,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockGetTemplateForService: vi.fn(),
  mockUpsertTemplateForService: vi.fn(),
  mockListAllServices: vi.fn(),
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

// Mock @tax-portal/db — stub the questionnaire-template and service repository functions
vi.mock("@tax-portal/db", () => ({
  getTemplateForService: mockGetTemplateForService,
  upsertTemplateForService: mockUpsertTemplateForService,
  listAllServices: mockListAllServices,
  withRequestContext: mockWithRequestContext,
}));

// ─── Import after mocks are set up ────────────────────────────────────────────

import {
  listServicesForTemplatesAction,
  getQuestionnaireTemplateAction,
  upsertQuestionnaireTemplateAction,
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

const SERVICE_INDIVIDUAL_TAX: { id: string; name: string; description: string | null; sortOrder: number } = {
  id: "svc-001",
  name: "Individual Tax Return",
  description: "Annual personal tax filing",
  sortOrder: 1,
};

const SERVICE_BUSINESS_TAX: { id: string; name: string; description: string | null; sortOrder: number } = {
  id: "svc-002",
  name: "Business Tax Return",
  description: "Annual business tax filing",
  sortOrder: 2,
};

const VALID_QUESTIONS: QuestionDef[] = [
  { id: "q-001", prompt: "What is your filing status?", type: "text", required: true },
  { id: "q-002", prompt: "Describe any major life changes this year.", type: "textarea", required: false },
];

const TEMPLATE_SVC_001: QuestionnaireTemplateItem = {
  id: "qt-001",
  serviceId: "svc-001",
  questions: JSON.stringify(VALID_QUESTIONS),
  updatedBy: "user_acct_test",
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

const TEMPLATE_SVC_002: QuestionnaireTemplateItem = {
  id: "qt-002",
  serviceId: "svc-002",
  questions: JSON.stringify([
    { id: "q-b01", prompt: "Business entity type?", type: "text", required: true },
  ]),
  updatedBy: "user_acct_test",
  createdAt: new Date("2026-06-02T00:00:00Z"),
  updatedAt: new Date("2026-06-02T00:00:00Z"),
};

// ─── Tests: listServicesForTemplatesAction ────────────────────────────────────

describe("listServicesForTemplatesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockListAllServices.mockResolvedValue([SERVICE_INDIVIDUAL_TAX, SERVICE_BUSINESS_TAX]);
    // withRequestContext pass-through — invoke the callback directly so listAllServices is still called
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, fn: () => Promise<unknown>) => fn(),
    );
  });

  it("returns success + service list when ACCOUNTANT", async () => {
    const result = await listServicesForTemplatesAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({ id: "svc-001", name: "Individual Tax Return" });
    }
    expect(mockListAllServices).toHaveBeenCalledOnce();
  });

  it("returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await listServicesForTemplatesAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockListAllServices).not.toHaveBeenCalled();
  });

  it("returns { success: false } when role is CLIENT (not ACCOUNTANT)", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await listServicesForTemplatesAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockListAllServices).not.toHaveBeenCalled();
  });
});

// ─── Tests: getQuestionnaireTemplateAction ────────────────────────────────────

describe("getQuestionnaireTemplateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetTemplateForService.mockResolvedValue(TEMPLATE_SVC_001);
  });

  /**
   * [AC-DASH-012-02] Template is fetched for the specific serviceId.
   */
  it("[AC-DASH-012-02] returns the template for the specified serviceId when ACCOUNTANT", async () => {
    const result = await getQuestionnaireTemplateAction("svc-001");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toBeNull();
      expect(result.data?.serviceId).toBe("svc-001");
      expect(result.data?.questions).toBe(JSON.stringify(VALID_QUESTIONS));
    }
    expect(mockGetTemplateForService).toHaveBeenCalledWith("svc-001");
  });

  it("returns success + null when no template exists for the service (absent template is acceptable)", async () => {
    mockGetTemplateForService.mockResolvedValue(null);

    const result = await getQuestionnaireTemplateAction("svc-001");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });

  it("returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await getQuestionnaireTemplateAction("svc-001");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockGetTemplateForService).not.toHaveBeenCalled();
  });

  it("returns { success: false } when role is CLIENT (not ACCOUNTANT)", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await getQuestionnaireTemplateAction("svc-001");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockGetTemplateForService).not.toHaveBeenCalled();
  });

  /**
   * [AC-DASH-012-02] Templates for different services are distinct — fetching svc-002 returns
   * svc-002's template, not svc-001's (no cross-contamination at the fetch layer).
   */
  it("[AC-DASH-012-02][AC-ONBD-003-02] fetching a different serviceId returns that service's template", async () => {
    mockGetTemplateForService.mockResolvedValue(TEMPLATE_SVC_002);

    const result = await getQuestionnaireTemplateAction("svc-002");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.serviceId).toBe("svc-002");
    }
    expect(mockGetTemplateForService).toHaveBeenCalledWith("svc-002");
  });
});

// ─── Tests: upsertQuestionnaireTemplateAction ─────────────────────────────────

describe("upsertQuestionnaireTemplateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    // Default: successful create (new template row)
    mockUpsertTemplateForService.mockResolvedValue({ rowsAffected: 1, action: "created" });
  });

  /**
   * [AC-DASH-012-01] Accountant creates a new template for a service type.
   * Expected: upsert called with serviceId + serialized questions; success.
   */
  it("[AC-DASH-012-01] creates a new template for a service type when ACCOUNTANT", async () => {
    const result = await upsertQuestionnaireTemplateAction("svc-001", VALID_QUESTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.action).toBe("created");
    }
    expect(mockUpsertTemplateForService).toHaveBeenCalledOnce();
    expect(mockUpsertTemplateForService).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: "svc-001",
        questions: expect.stringContaining("filing status"),
        accountantClerkId: ACCOUNTANT_IDENTITY.clerkUserId,
      }),
    );
  });

  /**
   * [AC-DASH-012-02] Template is bound to the selected serviceId.
   * The serviceId is passed through to the repository — not overridden or ignored.
   */
  it("[AC-DASH-012-02] passes the serviceId through to the repository call (service-type binding)", async () => {
    await upsertQuestionnaireTemplateAction("svc-001", VALID_QUESTIONS);

    expect(mockUpsertTemplateForService).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: "svc-001" }),
    );
  });

  /**
   * [AC-DASH-012-02] Binding is per serviceId — a different service gets a different call.
   */
  it("[AC-DASH-012-02] different serviceId produces a distinct repository call (no cross-contamination)", async () => {
    await upsertQuestionnaireTemplateAction("svc-002", VALID_QUESTIONS);

    expect(mockUpsertTemplateForService).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: "svc-002" }),
    );
    // Must NOT have been called with svc-001
    expect(mockUpsertTemplateForService).not.toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: "svc-001" }),
    );
  });

  /**
   * [AC-DASH-012-03] Accountant edits an existing template; edited content retained.
   * Upsert (update path) called; re-read (mocked) returns the new questions.
   */
  it("[AC-DASH-012-03] updates an existing template when one already exists (update path)", async () => {
    mockUpsertTemplateForService.mockResolvedValue({ rowsAffected: 1, action: "updated" });

    const updatedQuestions: QuestionDef[] = [
      { id: "q-001", prompt: "Updated: What is your filing status?", type: "text", required: true },
    ];
    const result = await upsertQuestionnaireTemplateAction("svc-001", updatedQuestions);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.action).toBe("updated");
    }
    expect(mockUpsertTemplateForService).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: "svc-001",
        questions: JSON.stringify(updatedQuestions),
      }),
    );
  });

  /**
   * [AC-DASH-012-03] Re-read after edit returns the updated questions (mocked persistence).
   * Simulates edit: upsert → getTemplate returns new questions.
   */
  it("[AC-DASH-012-03] re-read after update returns the edited questions (mocked persistence)", async () => {
    mockUpsertTemplateForService.mockResolvedValue({ rowsAffected: 1, action: "updated" });

    const editedQuestions: QuestionDef[] = [
      { id: "q-001", prompt: "Edited prompt", type: "textarea", required: false },
    ];
    await upsertQuestionnaireTemplateAction("svc-001", editedQuestions);

    // Simulate re-read: getTemplate returns the edited template
    const editedTemplate: QuestionnaireTemplateItem = {
      ...TEMPLATE_SVC_001,
      questions: JSON.stringify(editedQuestions),
      updatedBy: ACCOUNTANT_IDENTITY.clerkUserId,
    };
    mockGetTemplateForService.mockResolvedValue(editedTemplate);

    const readResult = await getQuestionnaireTemplateAction("svc-001");
    expect(readResult.success).toBe(true);
    if (readResult.success) {
      const parsed = JSON.parse(readResult.data!.questions) as QuestionDef[];
      expect(parsed[0]?.prompt).toBe("Edited prompt");
    }
  });

  /**
   * [AC-ONBD-003-02] Two service types carry distinct templates; no cross-contamination.
   * Upsert for svc-001 and svc-002 are independent calls; each keyed by their own serviceId.
   */
  it("[AC-ONBD-003-02] two service types receive distinct templates via separate upsert calls", async () => {
    const questionsForSvc1: QuestionDef[] = [
      { id: "q-001", prompt: "Individual question", type: "text", required: true },
    ];
    const questionsForSvc2: QuestionDef[] = [
      { id: "q-b01", prompt: "Business question", type: "textarea", required: true },
    ];

    await upsertQuestionnaireTemplateAction("svc-001", questionsForSvc1);
    await upsertQuestionnaireTemplateAction("svc-002", questionsForSvc2);

    expect(mockUpsertTemplateForService).toHaveBeenCalledTimes(2);
    expect(mockUpsertTemplateForService).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ serviceId: "svc-001", questions: JSON.stringify(questionsForSvc1) }),
    );
    expect(mockUpsertTemplateForService).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ serviceId: "svc-002", questions: JSON.stringify(questionsForSvc2) }),
    );
  });

  /**
   * Security: accountantClerkId comes from the verified session, never from arguments.
   */
  it("records accountantClerkId from the verified session (not from input)", async () => {
    await upsertQuestionnaireTemplateAction("svc-001", VALID_QUESTIONS);

    expect(mockUpsertTemplateForService).toHaveBeenCalledWith(
      expect.objectContaining({ accountantClerkId: "user_acct_test" }),
    );
  });

  /**
   * [security] Non-accountant identity is rejected; no repo write.
   */
  it("[security] returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await upsertQuestionnaireTemplateAction("svc-001", VALID_QUESTIONS);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockUpsertTemplateForService).not.toHaveBeenCalled();
  });

  /**
   * [security] CLIENT role is rejected; no repo write.
   */
  it("[security] returns { success: false } when role is CLIENT (not ACCOUNTANT)", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await upsertQuestionnaireTemplateAction("svc-001", VALID_QUESTIONS);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockUpsertTemplateForService).not.toHaveBeenCalled();
  });

  /**
   * [security] Empty questions array is rejected; validation failure, no repo write.
   */
  it("[security] returns { success: false } when questions array is empty", async () => {
    const result = await upsertQuestionnaireTemplateAction("svc-001", []);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/question/i);
    }
    expect(mockUpsertTemplateForService).not.toHaveBeenCalled();
  });

  /**
   * [security] Malformed questions object (missing required fields) is rejected.
   */
  it("[security] returns { success: false } when a question is missing required fields", async () => {
    const malformedQuestions = [
      { prompt: "Missing id and type" },
    ] as unknown as QuestionDef[];

    const result = await upsertQuestionnaireTemplateAction("svc-001", malformedQuestions);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/invalid|question/i);
    }
    expect(mockUpsertTemplateForService).not.toHaveBeenCalled();
  });

  /**
   * [security] Question with invalid type is rejected.
   */
  it("[security] returns { success: false } when question has invalid type (not text|textarea)", async () => {
    const invalidTypeQuestions = [
      { id: "q-001", prompt: "What?", type: "select" as unknown as "text", required: true },
    ];

    const result = await upsertQuestionnaireTemplateAction("svc-001", invalidTypeQuestions);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/invalid|type/i);
    }
    expect(mockUpsertTemplateForService).not.toHaveBeenCalled();
  });

  /**
   * [security] serviceId must be a non-empty string.
   */
  it("[security] returns { success: false } when serviceId is empty string", async () => {
    const result = await upsertQuestionnaireTemplateAction("", VALID_QUESTIONS);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/service/i);
    }
    expect(mockUpsertTemplateForService).not.toHaveBeenCalled();
  });

  /**
   * revalidatePath is called after a successful upsert.
   */
  it("calls revalidatePath after a successful upsert", async () => {
    await upsertQuestionnaireTemplateAction("svc-001", VALID_QUESTIONS);

    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/questionnaire-templates");
  });

  /**
   * revalidatePath is NOT called when validation fails.
   */
  it("does not call revalidatePath when validation fails (empty questions)", async () => {
    await upsertQuestionnaireTemplateAction("svc-001", []);

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
