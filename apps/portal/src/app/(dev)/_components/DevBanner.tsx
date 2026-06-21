/**
 * apps/portal/src/app/(dev)/_components/DevBanner.tsx
 *
 * Dev-only role/user switcher + sign-out banner (server wrapper component).
 *
 * This server component is wired into apps/portal's root layout. It:
 *   1. Checks isMockActive() — returns null under AUTH_PROVIDER=clerk (never renders in prod)
 *   2. Passes the DEMO_ACCOUNTS manifest + server actions to the client component
 *
 * CS-TS-003: mirrored in apps/admin/src/app/(dev)/_components/DevBanner.tsx.
 * ADR-001: the entire banner is absent under AUTH_PROVIDER=clerk.
 * ADR-005: only accountId is passed through the switcher — role resolved server-side.
 * ADR-010: sign-out is global; switcher re-lands on the correct app.
 *
 * // ADR-001 // ADR-005 // ADR-010 // CS-TS-003 // CS-GEN-003
 */

import { isMockAuthSanctioned } from "@tax-portal/auth";
import { DEMO_ACCOUNTS } from "../dev-sign-in/demo-accounts";
import { devGlobalSignOut, devSwitchAccount } from "../dev-sign-in/actions";
import { DevBannerClient } from "./DevBannerClient";

/**
 * DevBanner — server-side wrapper that gates the client banner component.
 *
 * Drop into the portal root layout. Returns null unless ALLOW_MOCK_AUTH=true AND
 * AUTH_PROVIDER=mock — zero cost in production. The client component handles the
 * interactive switcher + sign-out.
 *
 * Guard: isMockAuthSanctioned() from @tax-portal/auth — single source of truth.
 * CS-TS-003: present on both apps/portal (this file) and apps/admin (mirrored).
 *
 * // CS-TS-003 // ADR-001 // ADR-005 // ADR-010 // ADR-012
 */
export function DevBanner() {
  // ADR-001 / ADR-012: banner absent unless ALLOW_MOCK_AUTH=true AND AUTH_PROVIDER=mock
  if (!isMockAuthSanctioned()) {
    return null;
  }

  // Pass the full manifest to the client component — the client renders the account list.
  // ADR-005: only accountId values cross the server→client boundary (via the form submit);
  //   the displayName/label/email are for UI only; role is server-resolved on switch.
  return (
    <DevBannerClient
      accounts={DEMO_ACCOUNTS}
      switchAccountAction={devSwitchAccount}
      signOutAction={devGlobalSignOut}
    />
  );
}
