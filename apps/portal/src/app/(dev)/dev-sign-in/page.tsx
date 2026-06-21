/**
 * apps/portal/src/app/(dev)/dev-sign-in/page.tsx
 *
 * Dev sign-in lane — seeded-account picker for AUTH_PROVIDER=mock.
 *
 * This page is ONLY active when AUTH_PROVIDER=mock. Under AUTH_PROVIDER=clerk,
 * it returns a 404. The inert-under-real-provider guard is TASK-009-003.
 * (This mirrors the isMockActive() 404 pattern from /api/mock-session/route.ts.)
 *
 * The tester visits http://localhost:3000/dev-sign-in, picks an account,
 * and is signed in as that role — landing on the correct app surface:
 *   ACCOUNTANT → apps/admin (Tax Portal)
 *   CLIENT     → apps/portal/dashboard (Client Portal)
 *
 * D1 (ADR-005): the form submits ONLY accountId. The server (devSignInAsAccount)
 *   resolves role + clerkUserId from the DEMO_ACCOUNTS manifest. No role is ever
 *   read from or accepted from the browser.
 *
 * D3 (CS-TS-003): both role surfaces are reachable from this page.
 *
 * // ADR-001 (mock provider only — 404 under AUTH_PROVIDER=clerk)
 * // ADR-005 (server-set role; browser submits only accountId)
 * // ADR-010 (role-appropriate landing after sign-in)
 * // CS-TS-003 (both surfaces reachable from the lane)
 * // CS-GEN-003 (governing key citations present)
 */

import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { devSignInAsAccount } from "./actions";
import { getDemoAccountsByRole } from "./demo-accounts";

export const metadata: Metadata = {
  title: "Dev Sign-In Lane",
  description: "Dev-only sign-in picker — mock provider only.",
};

// Force dynamic rendering — this page reads env at request time (isMockActive check)
export const dynamic = "force-dynamic";

// ─── Inert guard ──────────────────────────────────────────────────────────────

/**
 * Returns true only when AUTH_PROVIDER=mock (or unset — defaults to mock in local dev).
 * ADR-001: the lane must be absent/404 under AUTH_PROVIDER=clerk.
 * TASK-009-003 owns the proving gate; this is the runtime guard.
 */
function isMockActive(): boolean {
  return (process.env["AUTH_PROVIDER"] ?? "mock") === "mock";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DevSignInPage() {
  // ADR-001: inert-under-real-binding guard — 404 when not under the mock provider.
  // TASK-009-003 owns the proving gate test for this guard.
  if (!isMockActive()) {
    notFound();
  }

  const { accountant: accountantAccounts, clients: clientAccounts } =
    getDemoAccountsByRole();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            <span aria-hidden>⚠</span>
            DEV ONLY — mock provider
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Dev Sign-In Lane</h1>
          <p className="text-sm text-gray-500 mt-1">
            Choose a seeded demo account to sign in as that role.
          </p>
        </div>

        {/* Account picker card */}
        <div
          className="bg-white rounded-lg border border-gray-200 shadow-sm p-6"
          data-testid="dev-sign-in-lane"
        >
          {/* Accountant section */}
          <section aria-labelledby="accountant-heading" className="mb-6">
            <h2
              id="accountant-heading"
              className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3"
            >
              Accountant
            </h2>
            <ul className="space-y-2" data-testid="accountant-list">
              {accountantAccounts.map((account) => (
                <li key={account.accountId}>
                  <SignInButton
                    accountId={account.accountId}
                    displayName={account.displayName}
                    label={account.label}
                    email={account.email}
                    role={account.role}
                  />
                </li>
              ))}
            </ul>
          </section>

          <hr className="border-gray-100 mb-6" />

          {/* Clients section */}
          <section aria-labelledby="clients-heading">
            <h2
              id="clients-heading"
              className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3"
            >
              Clients
            </h2>
            <ul className="space-y-2" data-testid="client-list">
              {clientAccounts.map((account) => (
                <li key={account.accountId}>
                  <SignInButton
                    accountId={account.accountId}
                    displayName={account.displayName}
                    label={account.label}
                    email={account.email}
                    role={account.role}
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Lane active under <code className="font-mono">AUTH_PROVIDER=mock</code> only.
          Not present in production builds.
        </p>
      </div>
    </div>
  );
}

// ─── Sign-in button form ───────────────────────────────────────────────────────

/**
 * Per-account sign-in button.
 *
 * D1 (ADR-005): submits ONLY accountId to the server action.
 * The role shown here is for display only — the server re-resolves it from
 * the DEMO_ACCOUNTS manifest. The browser cannot influence the established role.
 *
 * // ADR-005 // CS-GEN-003
 */
function SignInButton({
  accountId,
  displayName,
  label,
  email,
  role,
}: {
  accountId: string;
  displayName: string;
  label: string;
  email: string;
  role: string;
}) {
  // Server action wrapper — submits accountId and redirects on success.
  // D1: ONLY accountId crosses the browser→server boundary.
  // AC-AUTH-013-01: after sign-in, the user reaches the role-appropriate surface.
  async function handleSignIn() {
    "use server";
    // ADR-005: accountId only — role resolved server-side from manifest
    const result = await devSignInAsAccount(accountId);
    if (result.success && result.redirectTo) {
      redirect(result.redirectTo);
    }
    // On error, fall through (page re-renders with no session change)
  }

  const roleLabel = role === "ACCOUNTANT" ? "→ Tax Portal" : "→ Client Portal";
  const roleColor =
    role === "ACCOUNTANT"
      ? "text-purple-700 bg-purple-50"
      : "text-blue-700 bg-blue-50";

  return (
    <form action={handleSignIn}>
      <button
        type="submit"
        className="w-full text-left p-3 rounded-md border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
        data-testid={`sign-in-btn-${accountId}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="font-medium text-gray-900 text-sm block truncate">
              {displayName}
            </span>
            <span className="text-xs text-gray-400 block truncate">{email}</span>
            <span className="text-xs text-gray-500 block truncate mt-0.5">{label}</span>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${roleColor}`}
              data-testid={`role-badge-${accountId}`}
            >
              {role}
            </span>
            <span className="text-xs text-gray-400">{roleLabel}</span>
          </div>
        </div>
      </button>
    </form>
  );
}
