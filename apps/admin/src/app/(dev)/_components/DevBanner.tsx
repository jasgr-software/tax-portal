/**
 * apps/admin/src/app/(dev)/_components/DevBanner.tsx
 *
 * Dev-only role/user switcher + sign-out banner (server wrapper component) — admin surface.
 *
 * CS-TS-003: mirrors apps/portal/src/app/(dev)/_components/DevBanner.tsx.
 *   This server component is wired into apps/admin's root layout. It:
 *     1. Checks isMockActive() — returns null under AUTH_PROVIDER=clerk (never renders in prod)
 *     2. Passes the ADMIN_DEMO_ACCOUNTS manifest + admin server actions to the client component
 *
 * ADR-001: the entire banner is absent under AUTH_PROVIDER=clerk.
 * ADR-005: only accountId passes through the switcher — role resolved server-side.
 * ADR-010: sign-out is global; switcher re-lands on the correct app.
 *
 * // ADR-001 // ADR-005 // ADR-010 // CS-TS-003 // CS-GEN-003
 */

import { ADMIN_DEMO_ACCOUNTS } from "../dev-sign-in/demo-accounts";
import { adminDevGlobalSignOut, adminDevSwitchAccount } from "../dev-sign-in/actions";
import { AdminDevBannerClient } from "./DevBannerClient";

/**
 * Guard: only active under the mock binding.
 * ADR-001: inert (returns null) under AUTH_PROVIDER=clerk.
 */
function isMockActive(): boolean {
  // ADR-001: default is "mock" in local dev; explicitly "clerk" in production
  return (process.env["AUTH_PROVIDER"] ?? "mock") === "mock";
}

/**
 * AdminDevBanner — server-side wrapper that gates the client banner component.
 *
 * Drop into the admin root layout. Returns null in any non-mock build.
 * The client component handles the interactive switcher + sign-out.
 *
 * CS-TS-003: present on both apps/portal (mirrored) and apps/admin (this file).
 *
 * // CS-TS-003 // ADR-001 // ADR-005 // ADR-010
 */
export function AdminDevBanner() {
  // ADR-001: inert under AUTH_PROVIDER=clerk — banner absent in any real build
  if (!isMockActive()) {
    return null;
  }

  // Pass the full manifest to the client component — the client renders the account list.
  // ADR-005: only accountId values cross the server→client boundary (via button click);
  //   the displayName/label/email are for UI only; role is server-resolved on switch.
  return (
    <AdminDevBannerClient
      accounts={ADMIN_DEMO_ACCOUNTS}
      switchAccountAction={adminDevSwitchAccount}
      signOutAction={adminDevGlobalSignOut}
    />
  );
}
