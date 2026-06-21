/**
 * apps/portal/src/app/(dev)/_components/DevBannerClient.tsx
 *
 * Dev-only in-app role/user switcher + sign-out banner (client component).
 *
 * ONLY active under AUTH_PROVIDER=mock. The parent server component (DevBanner.tsx)
 * performs the isMockActive() guard — this component is never rendered in production.
 *
 * D4 (TASK-009-002 switcher):
 *   While signed in, the tester can switch to a different demo account (role/user
 *   switcher) without the devtools hack. The switch re-drives the server-set-role
 *   path (devSwitchAccount → devSignInAsAccount → DEMO_ACCOUNTS manifest) — the
 *   browser submits ONLY accountId; the role is resolved server-side.
 *
 * AC-AUTH-013-02 (sign-out / ADR-010):
 *   Sign-out clears the __mock_session cookie (max-age=0), leaving the user in an
 *   unauthenticated state on BOTH surfaces (global — localhost domain, no port in
 *   cookie domain matching).
 *
 * CS-TS-003: The DevBanner is present on BOTH apps/portal and apps/admin.
 *   The portal instance (this file) uses the portal-side server actions.
 *   The admin instance mirrors this component with admin-side server actions.
 *
 * ADR-005: The browser submits ONLY accountId in the switcher form. The role is
 *   NEVER submitted by the browser; devSwitchAccount resolves it server-side from
 *   the DEMO_ACCOUNTS manifest (same D1 guarantee as the original lane).
 *
 * CS-GEN-001: No cookie values, MOCK_SESSION_SECRET, or PII are rendered or logged.
 * CS-GEN-003: Governing keys cited in comments.
 *
 * // ADR-005 // ADR-010 // ADR-001 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

"use client";

import { useState, useTransition } from "react";
import type { DemoAccount } from "../dev-sign-in/demo-accounts";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DevBannerClientProps {
  /** All available demo accounts from the DEMO_ACCOUNTS manifest */
  accounts: readonly DemoAccount[];
  /** Server action: switch to a different demo account (returns redirectTo) */
  switchAccountAction: (accountId: string) => Promise<{ success: boolean; redirectTo?: string; error?: string }>;
  /** Server action: global sign-out (returns redirectTo) */
  signOutAction: () => Promise<{ redirectTo: string }>;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * DevBannerClient — the interactive role/user switcher + sign-out affordance.
 *
 * Rendered server-side in DevBanner.tsx only when AUTH_PROVIDER=mock.
 * Never shipped to production.
 *
 * // CS-TS-003 (present on both surfaces — this is the portal instance)
 * // ADR-005 (submits only accountId; role resolved server-side in switchAccountAction)
 * // ADR-010 (sign-out is global; switcher re-lands on correct app)
 */
export function DevBannerClient({
  accounts,
  switchAccountAction,
  signOutAction,
}: DevBannerClientProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Sign-out ──────────────────────────────────────────────────────────────

  /**
   * Handle sign-out: invoke the server action, then redirect on success.
   *
   * AC-AUTH-013-02: sign-out ends the session → unauthenticated → re-auth required.
   * ADR-010: cookie is global across both apps (cleared server-side via max-age=0).
   *
   * // AC-AUTH-013-02 // ADR-010
   */
  function handleSignOut() {
    setError(null);
    startTransition(async () => {
      const result = await signOutAction();
      // After sign-out, redirect to the dev sign-in lane (or portal sign-in)
      window.location.href = result.redirectTo;
    });
  }

  // ── Switch account ────────────────────────────────────────────────────────

  /**
   * Handle account switch: submit the chosen accountId to the server action.
   *
   * ADR-005: the form submits ONLY accountId; the server resolves role + clerkUserId.
   * ADR-010: the server action returns the landing URL for the newly chosen role.
   * CS-TS-003: both roles are available in the switcher (all accounts in the manifest).
   *
   * // ADR-005 // ADR-010 // CS-TS-003
   */
  function handleSwitch(accountId: string) {
    setError(null);
    startTransition(async () => {
      // ADR-005: only accountId crosses the boundary — role is server-resolved
      const result = await switchAccountAction(accountId);
      if (result.success && result.redirectTo) {
        // ADR-010: re-land on the correct surface for the newly chosen role
        window.location.href = result.redirectTo;
      } else {
        setError(result.error ?? "Switch failed. Please try again.");
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const accountantAccounts = accounts.filter((a) => a.role === "ACCOUNTANT");
  const clientAccounts = accounts.filter((a) => a.role === "CLIENT");

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-amber-50 border-t-2 border-amber-400 shadow-lg"
      data-testid="dev-banner"
      aria-label="Developer mode banner — role/user switcher"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4 flex-wrap">
        {/* Label */}
        <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold shrink-0">
          <span aria-hidden>⚠</span>
          <span>DEV MODE</span>
        </div>

        {/* Switcher */}
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Switch demo account">
          <span className="text-xs text-amber-700 font-medium">Switch to:</span>

          {/* Accountant accounts */}
          {accountantAccounts.map((account) => (
            <button
              key={account.accountId}
              type="button"
              onClick={() => handleSwitch(account.accountId)}
              disabled={isPending}
              className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-800 hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              data-testid={`dev-switch-btn-${account.accountId}`}
              title={`Sign in as ${account.displayName} (${account.role})`}
            >
              {account.displayName}
            </button>
          ))}

          {/* Divider */}
          {accountantAccounts.length > 0 && clientAccounts.length > 0 && (
            <span className="text-amber-400 text-xs" aria-hidden>|</span>
          )}

          {/* Client accounts */}
          {clientAccounts.map((account) => (
            <button
              key={account.accountId}
              type="button"
              onClick={() => handleSwitch(account.accountId)}
              disabled={isPending}
              className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              data-testid={`dev-switch-btn-${account.accountId}`}
              title={`Sign in as ${account.displayName} (${account.role})`}
            >
              {account.displayName}
            </button>
          ))}
        </div>

        {/* Error display */}
        {error && (
          <span className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded" role="alert">
            {error}
          </span>
        )}

        {/* Sign-out button */}
        {/* AC-AUTH-013-02: sign-out ends the session globally — ADR-010 */}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isPending}
          className="text-xs px-3 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium shrink-0"
          data-testid="dev-sign-out-btn"
          aria-label="Sign out (global — clears session on all surfaces)"
        >
          {isPending ? "…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
