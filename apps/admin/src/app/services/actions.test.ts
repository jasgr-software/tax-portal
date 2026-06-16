/**
 * apps/admin/src/app/services/actions.test.ts — Unit tests for service catalog server actions
 *
 * Tier 2/5: Unit tests — no real DB connection, all external modules mocked.
 *
 * AC-DOOR-002-01: createServiceAction returns success + data with active=true
 * AC-DOOR-002-02: updateServiceAction returns success + data with updated fields
 * AC-DOOR-002-03: deactivateServiceAction returns success + data with active=false
 *
 * Security tests (ADR-005 identity provenance):
 *   - Actions return { success: false } when identity is null (unauthenticated)
 *   - Actions return { success: false } when role is CLIENT (not ACCOUNTANT)
 *   - Input validation: empty name, missing id, invalid sortOrder
 *
 * These tests cover the action layer's routing logic: identity gating, input validation,
 * and delegation to the repository. The repository itself is tested in the tier-3
 * persistence test (service.persistence.test.ts) against a real SQL Server container.
 *
 * DECISION (TASK-002-002): withRequestContext is mocked to pass through the fn() call
 * directly — this lets us verify the action correctly delegates to the repo without
 * needing SESSION_CONTEXT or a real DB connection. The tier-3 test proves the real path.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServiceItem } from "@tax-portal/db";

// ─── Hoisted mock functions ───────────────────────────────────────────────────
//
// DECISION (TASK-002-002): vi.hoisted() is required because vi.mock() factories are
// hoisted to the top of the file, before any const/let declarations. Variables defined
// after the vi.mock() call cannot be accessed inside the factory.
// Using vi.hoisted() ensures the mock functions are available when the factory runs.

const { mockGetIdentity, mockCreateService, mockUpdateService, mockDeactivateService } =
  vi.hoisted(() => ({
    mockGetIdentity: vi.fn(),
    mockCreateService: vi.fn(),
    mockUpdateService: vi.fn(),
    mockDeactivateService: vi.fn(),
  }));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers — server action reads cookie header to build synthetic Request
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === "cookie" ? "mock-cookie=session" : null),
  }),
}));

// Mock next/cache — revalidatePath should be a no-op in tests
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock @tax-portal/auth — return a verified ACCOUNTANT identity by default
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

// Mock @tax-portal/db — provide withRequestContext passthrough + stub write functions
vi.mock("@tax-portal/db", () => ({
  // withRequestContext passes through to fn() — no actual SESSION_CONTEXT needed in unit tests
  withRequestContext: vi.fn().mockImplementation(
    (_clerkUserId: string, _role: string, fn: () => Promise<unknown>) => fn()
  ),
  createService: mockCreateService,
  updateService: mockUpdateService,
  deactivateService: mockDeactivateService,
}));

// ─── Import after mocks are set up ────────────────────────────────────────────

import {
  createServiceAction,
  updateServiceAction,
  deactivateServiceAction,
} from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_SERVICE: ServiceItem = {
  id: "test-svc-001",
  name: "Individual Tax Return",
  description: "1040 preparation",
  active: true,
  sortOrder: 1,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const MOCK_INACTIVE_SERVICE: ServiceItem = {
  ...MOCK_SERVICE,
  active: false,
};

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test",
  role: "CLIENT" as const,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("createServiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockCreateService.mockResolvedValue(MOCK_SERVICE);
  });

  /**
   * [AC-DOOR-002-01] Happy path: action returns success + data with active=true
   */
  it("[AC-DOOR-002-01] returns success + service data when identity is ACCOUNTANT", async () => {
    const result = await createServiceAction({ name: "Individual Tax Return", description: "1040 prep", sortOrder: 1 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Individual Tax Return");
      expect(result.data.active).toBe(true); // AC-DOOR-002-01
    }
  });

  it("calls createService with trimmed name", async () => {
    await createServiceAction({ name: "  Tax Return  ", sortOrder: 0 });
    expect(mockCreateService).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Tax Return" })
    );
  });

  /**
   * Security: identity null → returns unauthorized error (ADR-005)
   */
  it("returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);
    const result = await createServiceAction({ name: "Test Service" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  /**
   * Security: CLIENT role → returns unauthorized error (ADR-005)
   */
  it("returns { success: false } when role is CLIENT (not ACCOUNTANT)", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    const result = await createServiceAction({ name: "Test Service" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  /**
   * Input validation: empty name
   */
  it("returns { success: false } when name is empty", async () => {
    const result = await createServiceAction({ name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/name.*required|required.*name/i);
    }
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  /**
   * Input validation: name exceeds 200 chars
   */
  it("returns { success: false } when name exceeds 200 characters", async () => {
    const result = await createServiceAction({ name: "A".repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/200/);
    }
    expect(mockCreateService).not.toHaveBeenCalled();
  });
});

describe("updateServiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockUpdateService.mockResolvedValue({ ...MOCK_SERVICE, name: "Updated Name" });
  });

  /**
   * [AC-DOOR-002-02] Happy path: action returns success + updated data
   */
  it("[AC-DOOR-002-02] returns success + updated service when identity is ACCOUNTANT", async () => {
    const result = await updateServiceAction({ id: "test-svc-001", name: "Updated Name" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Updated Name"); // AC-DOOR-002-02
    }
    expect(mockUpdateService).toHaveBeenCalled();
  });

  it("returns { success: false } when identity is null", async () => {
    mockGetIdentity.mockResolvedValue(null);
    const result = await updateServiceAction({ id: "test-svc-001", name: "New Name" });
    expect(result.success).toBe(false);
    expect(mockUpdateService).not.toHaveBeenCalled();
  });

  it("returns { success: false } when role is CLIENT", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    const result = await updateServiceAction({ id: "test-svc-001", name: "New Name" });
    expect(result.success).toBe(false);
    expect(mockUpdateService).not.toHaveBeenCalled();
  });

  it("returns { success: false } when id is missing", async () => {
    const result = await updateServiceAction({ id: "", name: "New Name" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/id.*required|required.*id/i);
    }
    expect(mockUpdateService).not.toHaveBeenCalled();
  });

  it("returns { success: false } when name is provided but empty", async () => {
    const result = await updateServiceAction({ id: "test-svc-001", name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/name.*non-empty|non-empty/i);
    }
    expect(mockUpdateService).not.toHaveBeenCalled();
  });
});

describe("deactivateServiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockDeactivateService.mockResolvedValue(MOCK_INACTIVE_SERVICE);
  });

  /**
   * [AC-DOOR-002-03] Happy path: action returns success + data with active=false
   */
  it("[AC-DOOR-002-03] returns success + data with active=false when identity is ACCOUNTANT", async () => {
    const result = await deactivateServiceAction("test-svc-001");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.active).toBe(false); // AC-DOOR-002-03: active=false, not deleted
      expect(result.data.id).toBe("test-svc-001");
    }
    expect(mockDeactivateService).toHaveBeenCalledWith("test-svc-001");
  });

  it("returns { success: false } when identity is null", async () => {
    mockGetIdentity.mockResolvedValue(null);
    const result = await deactivateServiceAction("test-svc-001");
    expect(result.success).toBe(false);
    expect(mockDeactivateService).not.toHaveBeenCalled();
  });

  it("returns { success: false } when role is CLIENT", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    const result = await deactivateServiceAction("test-svc-001");
    expect(result.success).toBe(false);
    expect(mockDeactivateService).not.toHaveBeenCalled();
  });

  it("returns { success: false } when id is empty", async () => {
    const result = await deactivateServiceAction("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/id.*required|required.*id/i);
    }
    expect(mockDeactivateService).not.toHaveBeenCalled();
  });
});
