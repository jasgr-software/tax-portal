/**
 * apps/admin/src/app/(dev)/dev-sign-in/demo-accounts.ts
 *
 * Admin-surface dev-only static manifest of seeded demo accounts.
 *
 * Mirrors apps/portal/src/app/(dev)/dev-sign-in/demo-accounts.ts.
 * CS-TS-003: the same accounts are available on both surfaces.
 *
 * DECISION (TASK-009-002, CS-TS-003):
 *   Rather than importing from apps/portal (cross-app import anti-pattern),
 *   the manifest is declared locally with the same entries. Both manifests
 *   must stay in sync with db/seed/demo/clients.ts.
 *   CS-GEN-002: additive only — never remove existing entries (keyed artifact).
 *
 * ADR-005: role is server-resolved from this manifest, never from the browser.
 * ADR-001: active only under AUTH_PROVIDER=mock.
 *
 * // ADR-001 // ADR-005 // CS-TS-003 // CS-GEN-002 // CS-GEN-003
 */

import type { Role } from "@tax-portal/auth";

// ─── Type ─────────────────────────────────────────────────────────────────────

/**
 * A single demo account entry (mirrors portal's DemoAccount).
 * ADR-005: role and clerkUserId are server-resolved, never client-supplied.
 */
export interface AdminDemoAccount {
  accountId: string;
  clerkUserId: string;
  role: Role;
  displayName: string;
  email: string;
  label: string;
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

/**
 * Static manifest of seeded demo accounts — mirrored from portal lane.
 * ADR-005: role is server-resolved from this manifest, never from the browser.
 * ADR-001: active only under AUTH_PROVIDER=mock.
 * CS-GEN-002: additive only — never remove entries (keyed artifact).
 */
export const ADMIN_DEMO_ACCOUNTS: readonly AdminDemoAccount[] = [
  // ── Accountant ────────────────────────────────────────────────────────────
  {
    accountId: "accountant-jane",
    clerkUserId: "demo_usr_jane_accountant",
    role: "ACCOUNTANT",
    displayName: "Jane (Accountant)",
    email: "jane@example-accountant.com",
    label: "Tax accountant — lands on Tax Portal (admin)",
  },
  // ── Clients ───────────────────────────────────────────────────────────────
  // CS-GEN-002: additive only — entries below match portal manifest
  {
    accountId: "client-margaret",
    clerkUserId: "demo_usr_margaret_okonkwo",
    role: "CLIENT",
    displayName: "Margaret Okonkwo",
    email: "margaret.okonkwo@example.com",
    label: "Client — lands on Client Portal",
  },
  {
    accountId: "client-rafael",
    clerkUserId: "demo_usr_rafael_montoya",
    role: "CLIENT",
    displayName: "Rafael Montoya",
    email: "rafael.montoya@example.com",
    label: "Client — lands on Client Portal",
  },
  {
    accountId: "client-diane",
    clerkUserId: "demo_usr_diane_hartwell",
    role: "CLIENT",
    displayName: "Diane Hartwell",
    email: "diane.hartwell@example.com",
    label: "Client — lands on Client Portal",
  },
  {
    accountId: "client-sarah",
    clerkUserId: "demo_usr_linda_svensson",
    role: "CLIENT",
    displayName: "Sarah (Returning Client)",
    email: "linda.svensson@example.com",
    label: "Returning client persona — lands on Client Portal",
  },
] as const;

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Find a demo account by accountId.
 * ADR-005: server-side only; the browser never receives role or clerkUserId.
 */
export function findAdminDemoAccount(accountId: string): AdminDemoAccount | undefined {
  return ADMIN_DEMO_ACCOUNTS.find((a) => a.accountId === accountId);
}
