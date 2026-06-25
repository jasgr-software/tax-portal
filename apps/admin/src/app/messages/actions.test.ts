/**
 * apps/admin/src/app/messages/actions.test.ts
 *
 * Unit tests for the TASK-017-010 additions to the admin general-thread messages actions:
 *   - listClientsAction — ACCOUNTANT identity guard + admin-pool client list read
 *   - createGeneralThreadForClientAction — validated wrapper; server-validates clientUserId
 *
 * TASK-017-010 / BRIEF-017 — Acceptance criteria tested here:
 *   [AC-MSG-002-01] listClientsAction: ACCOUNTANT identity required; returns client list.
 *   [AC-MSG-002-01] listClientsAction: CLIENT identity refused before any DB access.
 *   [AC-MSG-002-01] createGeneralThreadForClientAction: chosen clientUserId is validated
 *     against the listed set server-side before calling startGeneralThreadAction.
 *   [AC-MSG-002-01] createGeneralThreadForClientAction: a clientUserId NOT in the listed
 *     set is rejected — never passed to startGeneralThreadAction. (Server-validation gate.)
 *   [AC-MSG-002-02] createGeneralThreadForClientAction: on success, returns the thread
 *     associated with the chosen client.
 *   [CS-TS-004] both actions refuse a CLIENT identity before any DB access.
 *
 * Security contract:
 *   - Identity from session cookie only — never from args (CS-TS-004 / ADR-003).
 *   - CLIENT identity refused before DB access (CS-TS-004 / ADR-006).
 *   - clientUserId in createGeneralThreadForClientAction is NEVER trusted raw from the form;
 *     server validates it against the listed set (ADR-003).
 *
 * Strategy:
 *   - No real DB connection — all seam calls are mocked.
 *   - listClients mock injects a controllable client list.
 *   - createGeneralThread mock verifies it is only called with a validated clientUserId.
 *   - CS-GEN-001: client names/emails never appear in log assertions. // CS-GEN-001
 *   - CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-002-01 // AC-MSG-002-02 // AC-MSG-006-01
 * // CS-TS-004 // ADR-003 // ADR-006 // CS-GEN-001 // CS-GEN-003
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockListClients,
  mockCreateGeneralThread,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockListClients: vi.fn(),
  mockCreateGeneralThread: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => {
      if (key === "cookie") return "mock-cookie=session";
      return null;
    },
  }),
}));

vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

// Mock the @tax-portal/db barrel — only what the messages/actions.ts file uses.
// CS-TS-002: the action file MUST NOT import raw pools; mock only the barrel. // CS-TS-002
vi.mock("@tax-portal/db", () => ({
  listClients: mockListClients,
  createGeneralThread: mockCreateGeneralThread,
  // Other exports used by the same file (stubs to prevent import errors)
  appendMessage: vi.fn(),
  markThreadRead: vi.fn(),
  withRequestContext: vi.fn(),
  storeAndScanAttachment: vi.fn(),
  authorizeThenSignAttachment: vi.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  listClientsAction,
  createGeneralThreadForClientAction,
} from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNTANT_IDENTITY = { clerkUserId: "user_acct_017_010_admin", role: "ACCOUNTANT" as const };
const CLIENT_IDENTITY = { clerkUserId: "user_client_017_010_portal", role: "CLIENT" as const };

const ALICE_USER_ID = "uid-alice-017-010-aaaa-000000000001";
const BOB_USER_ID = "uid-bob-017-010-bbbb-000000000002";

const MOCK_CLIENT_LIST = [
  { clientUserId: ALICE_USER_ID, firstName: "Alice", lastName: "Smith", email: "alice@example.com" },
  { clientUserId: BOB_USER_ID, firstName: "Bob", lastName: "Jones", email: "bob@example.com" },
];

const MOCK_GENERAL_THREAD = {
  id: "thr-017-010-general-aaaa-000000000001",
  kind: "general",
  engagementId: null,
  clientUserId: ALICE_USER_ID,
  status: "active",
  archivedAt: null,
  createdAt: new Date("2026-06-25T14:00:00Z"),
  updatedAt: new Date("2026-06-25T14:00:00Z"),
};

// ─── listClientsAction ────────────────────────────────────────────────────────

describe("[AC-MSG-002-01] [CS-TS-004] listClientsAction — ACCOUNTANT identity guard + client list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "[CS-TS-004] [ADR-003] CLIENT identity refused before any DB access",
    async () => {
      // CS-TS-004: CLIENT identity on admin surface → refused immediately. // CS-TS-004
      // ADR-003: identity from session only; DB access NEVER precedes the guard. // ADR-003
      mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

      const result = await listClientsAction();

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
      // listClients (DB) must NOT be called when identity is wrong
      expect(mockListClients).not.toHaveBeenCalled();
    },
  );

  it(
    "[CS-TS-004] [ADR-003] unauthenticated caller (null identity) refused before any DB access",
    async () => {
      // ADR-003: null identity → refused immediately. // ADR-003
      mockGetIdentity.mockResolvedValue(null);

      const result = await listClientsAction();

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
      expect(mockListClients).not.toHaveBeenCalled();
    },
  );

  it(
    "[AC-MSG-002-01] ACCOUNTANT identity → returns client list from listClients",
    async () => {
      // AC-MSG-002-01: ACCOUNTANT gets the client list for the selector. // AC-MSG-002-01
      // CS-TS-001: listClients from @tax-portal/db barrel (admin pool inside packages/db). // CS-TS-001
      mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
      mockListClients.mockResolvedValue(MOCK_CLIENT_LIST);

      const result = await listClientsAction();

      expect(result.success).toBe(true);
      const { data } = result as { success: true; data: typeof MOCK_CLIENT_LIST };
      expect(data).toHaveLength(2);
      expect(data[0]?.clientUserId).toBe(ALICE_USER_ID);
      expect(data[1]?.clientUserId).toBe(BOB_USER_ID);
      // CS-GEN-001: we do NOT assert on names/emails in logs — test only the returned data shape. // CS-GEN-001
    },
  );

  it(
    "[AC-MSG-002-01] ACCOUNTANT gets empty array when no clients exist",
    async () => {
      // Empty list is valid — selector renders with no options. // AC-MSG-002-01
      mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
      mockListClients.mockResolvedValue([]);

      const result = await listClientsAction();

      expect(result.success).toBe(true);
      const { data } = result as { success: true; data: unknown[] };
      expect(data).toEqual([]);
    },
  );

  it(
    "[CS-GEN-001] listClients error returns generic message — no PII surfaced",
    async () => {
      // CS-GEN-001: error messages must not surface PII (client names/emails). // CS-GEN-001
      mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
      mockListClients.mockRejectedValue(new Error("DB connection failed"));

      const result = await listClientsAction();

      expect(result.success).toBe(false);
      const { error } = result as { success: false; error: string };
      // Error is generic — does not include connection details or PII
      expect(error).toBeTruthy();
      expect(error).not.toContain("DB connection");
      expect(error).not.toContain("alice@");
    },
  );
});

// ─── createGeneralThreadForClientAction ──────────────────────────────────────

describe(
  "[AC-MSG-002-01] [AC-MSG-002-02] createGeneralThreadForClientAction — server-validated wrapper",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it(
      "[CS-TS-004] [ADR-003] CLIENT identity refused before any DB access",
      async () => {
        // CS-TS-004: CLIENT identity → refused immediately. // CS-TS-004
        mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

        const result = await createGeneralThreadForClientAction(ALICE_USER_ID);

        expect(result.success).toBe(false);
        expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
        expect(mockListClients).not.toHaveBeenCalled();
        expect(mockCreateGeneralThread).not.toHaveBeenCalled();
      },
    );

    it(
      "[ADR-003] unauthenticated caller refused before any DB access",
      async () => {
        mockGetIdentity.mockResolvedValue(null);

        const result = await createGeneralThreadForClientAction(ALICE_USER_ID);

        expect(result.success).toBe(false);
        expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
        expect(mockListClients).not.toHaveBeenCalled();
        expect(mockCreateGeneralThread).not.toHaveBeenCalled();
      },
    );

    it(
      "[ADR-003] empty clientUserId rejected without any DB call",
      async () => {
        // Input validation fires before DB access. // ADR-003
        mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);

        const result = await createGeneralThreadForClientAction("   ");

        expect(result.success).toBe(false);
        expect(mockListClients).not.toHaveBeenCalled();
        expect(mockCreateGeneralThread).not.toHaveBeenCalled();
      },
    );

    it(
      "[ADR-003] clientUserId NOT in the listed set is rejected (server-validation gate)",
      async () => {
        // SECURITY: clientUserId is never trusted raw. The server re-derives the allowed set
        // and validates the choice. A fake/injected id is rejected here. // ADR-003
        mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
        mockListClients.mockResolvedValue(MOCK_CLIENT_LIST);

        // "injected-id" is not in MOCK_CLIENT_LIST
        const result = await createGeneralThreadForClientAction("injected-id-not-in-list");

        expect(result.success).toBe(false);
        const { error } = result as { success: false; error: string };
        expect(error).toMatch(/invalid client/i);
        // createGeneralThread (DB) must NOT be called with an invalid id
        expect(mockCreateGeneralThread).not.toHaveBeenCalled();
      },
    );

    it(
      "[AC-MSG-002-01] valid clientUserId in listed set → startGeneralThreadAction called + thread returned",
      async () => {
        // AC-MSG-002-01: chosen client in listed set → thread created. // AC-MSG-002-01
        mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
        mockListClients.mockResolvedValue(MOCK_CLIENT_LIST);
        mockCreateGeneralThread.mockResolvedValue(MOCK_GENERAL_THREAD);

        const result = await createGeneralThreadForClientAction(ALICE_USER_ID);

        expect(result.success).toBe(true);
        const { data } = result as { success: true; data: typeof MOCK_GENERAL_THREAD };

        // AC-MSG-002-02: the returned thread is associated with the chosen client. // AC-MSG-002-02
        expect(data.id).toBe(MOCK_GENERAL_THREAD.id);
        expect(data.clientUserId).toBe(ALICE_USER_ID);
        expect(data.kind).toBe("general");

        // createGeneralThread was called with the validated clientUserId
        expect(mockCreateGeneralThread).toHaveBeenCalledWith({ clientUserId: ALICE_USER_ID });
      },
    );

    it(
      "[AC-MSG-002-01] whitespace-trimmed clientUserId still validated correctly",
      async () => {
        // Trim is applied before validation — whitespace-padded ids are handled. // ADR-003
        mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
        mockListClients.mockResolvedValue(MOCK_CLIENT_LIST);
        mockCreateGeneralThread.mockResolvedValue(MOCK_GENERAL_THREAD);

        // Pass Alice's id with surrounding whitespace
        const result = await createGeneralThreadForClientAction(`  ${ALICE_USER_ID}  `);

        expect(result.success).toBe(true);
        // After trimming, the id matches Alice's id in the listed set
        expect(mockCreateGeneralThread).toHaveBeenCalledWith({ clientUserId: ALICE_USER_ID });
      },
    );

    it(
      "[CS-GEN-001] listClients failure during createGeneralThreadForClientAction returns generic error",
      async () => {
        // CS-GEN-001: error must not surface PII (names/emails). // CS-GEN-001
        mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
        mockListClients.mockRejectedValue(new Error("Pool timeout"));

        const result = await createGeneralThreadForClientAction(ALICE_USER_ID);

        expect(result.success).toBe(false);
        const { error } = result as { success: false; error: string };
        expect(error).toBeTruthy();
        // Generic error — no DB internals surfaced
        expect(error).not.toContain("Pool timeout");
        expect(mockCreateGeneralThread).not.toHaveBeenCalled();
      },
    );
  },
);
