/**
 * apps/portal/src/app/(dev)/dev-sign-in/demo-accounts.ts
 *
 * Dev-only static manifest of seeded demo accounts for the sign-in lane.
 *
 * DECISION (TASK-009-001 — D2/CS-TS-001):
 *   A dev-only static manifest is used instead of a live DB read for the following reasons:
 *   (a) The demo seed (db/seed/demo/clients.ts) exports stable clerkIds prefixed "demo_" —
 *       they are deterministic and will never collide with real Clerk user ids.
 *   (b) A DB read at the lane render time would require a withRequestContext() identity,
 *       which the lane is itself in the process of establishing — a chicken-and-egg situation
 *       that a DB read cannot resolve without an already-authenticated session.
 *   (c) This is dev-only tooling (the lane is inert under AUTH_PROVIDER=clerk); the static
 *       manifest is safe for its purpose — no production data flows through it.
 *   (d) Using a manifest avoids any direct Prisma access in the lane; no DB wrapper is needed.
 *   Justification logged per CS-TS-001 requirement.
 *
 * This file must stay in sync with db/seed/demo/clients.ts and any accountant seed.
 * The lane CONSUMES the existing demo seed (pnpm demo:stage); it does NOT own it.
 *
 * // ADR-001 (mock provider only — inert under AUTH_PROVIDER=clerk)
 * // ADR-005 (role is server-resolved from this manifest, never client-supplied)
 * // CS-TS-001 (no DB read in the lane — justified dev-only manifest DECISION above)
 * // CS-GEN-003 (governing key citations in code)
 */

import type { Role } from "@tax-portal/auth";

// ─── Type ─────────────────────────────────────────────────────────────────────

/**
 * A single demo account entry. The clerkId is the stable fake id seeded by
 * db/seed/demo/clients.ts. Role is resolved server-side from this manifest —
 * the browser supplies only the accountId; the server looks up role + clerkId.
 *
 * ADR-005: role and clerkUserId are server-resolved, never client-supplied.
 */
export interface DemoAccount {
  /** Unique id for this entry — used as the form value the browser submits */
  accountId: string;
  /** Stable fake Clerk id from the demo seed (demo_ prefix) */
  clerkUserId: string;
  /** Server-resolved role — ADR-005: never comes from the browser */
  role: Role;
  /** Display name for the lane picker UI */
  displayName: string;
  /** Email (for display only) */
  email: string;
  /** Descriptive label shown in the picker */
  label: string;
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

/**
 * Static manifest of seeded demo accounts.
 *
 * The accountant entry uses the same stable clerkId as the accountant seed
 * (see scripts/db-seed.ts / db/seed/ for the accountant seed definitioin).
 *
 * Client entries are a representative subset from db/seed/demo/clients.ts —
 * the "accepted" clients who have real engagements to demo (Margaret, Rafael,
 * Diane) plus Sarah (returning client persona from planning/personas/).
 *
 * ADR-001: only active under AUTH_PROVIDER=mock.
 * ADR-005: role resolved server-side; accountId is the only browser-submitted value.
 */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  // ── Accountant ────────────────────────────────────────────────────────────
  {
    accountId: "accountant-jane",
    clerkUserId: "demo_usr_jane_accountant",
    role: "ACCOUNTANT",
    displayName: "Jane (Accountant)",
    email: "jane@example-accountant.com",
    label: "Tax accountant — lands on Tax Portal (admin)",
  },
  // ── Clients (accepted, with active engagements) ───────────────────────────
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
  // Sarah returning client (persona from .planning/personas/sarah-returning-client.md)
  {
    accountId: "client-sarah",
    clerkUserId: "demo_usr_linda_svensson", // closest seeded returning-client-persona match
    role: "CLIENT",
    displayName: "Sarah (Returning Client)",
    email: "linda.svensson@example.com",
    label: "Returning client persona — lands on Client Portal",
  },
] as const;

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Find a demo account by its accountId.
 * Returns undefined if not found — callers must validate before use.
 *
 * ADR-005: server-side only; the browser never receives role or clerkUserId.
 */
export function findDemoAccount(accountId: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((a) => a.accountId === accountId);
}

/**
 * Returns accounts grouped by role for the picker UI.
 */
export function getDemoAccountsByRole(): {
  accountant: DemoAccount[];
  clients: DemoAccount[];
} {
  return {
    accountant: DEMO_ACCOUNTS.filter((a) => a.role === "ACCOUNTANT"),
    clients: DEMO_ACCOUNTS.filter((a) => a.role === "CLIENT"),
  };
}
