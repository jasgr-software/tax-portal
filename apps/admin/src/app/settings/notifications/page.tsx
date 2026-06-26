/**
 * apps/admin/src/app/settings/notifications/page.tsx
 *
 * Accountant-only settings page for email notification suppression.
 *
 * AC-MSG-010-01: The accountant can turn off her own email notifications entirely.
 *   Toggle calls setOwnEmailNudgeSuppressionAction; current state read on server render.
 *
 * ADR-006: This page is apps/admin ONLY. There is NO mirror route in apps/portal.
 *   Email-settings UI is accountant-only (brief Out of scope for clients). // ADR-006
 *
 * ADR-010: apps/admin has NO public routes. The middleware guarantees ACCOUNTANT auth
 *   before this page renders. This page adds a defense-in-depth identity guard.
 *
 * CS-TS-004: getAccountantIdentity() resolves identity from cookie before any DB read. // CS-TS-004
 * CS-TS-001: current preference read via withRequestContext (SESSION_CONTEXT set). // CS-TS-001
 * CS-GEN-001: no PII in server logs. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { EmailSuppressionToggle } from "./_components/EmailSuppressionToggle";
import { getOwnEmailNudgePreferenceAction } from "./actions";


export const metadata = {
  title: "Notification Settings",
};

export default async function NotificationSettingsPage() {
  // Defense-in-depth identity guard — ADR-010 middleware guarantees ACCOUNTANT,
  // but we re-verify here to match the established page pattern (letter-template/page.tsx).
  // CS-TS-004: cookie → synthetic Request → provider.getIdentity() → role check. // CS-TS-004
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "ACCOUNTANT") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-red-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Tax Portal</h1>
          <p className="text-sm text-red-600">Authentication required. Please sign in.</p>
        </div>
      </div>
    );
  }

  // Read the accountant's current email preference (CS-TS-001 wrapped read). // CS-TS-001
  // AC-MSG-011-01: default-on if row absent (returned by getEmailNudgePreferenceForCurrentUser). // AC-MSG-011-01
  let initialEmailEnabled = true;
  let prefError: string | null = null;

  const prefResult = await getOwnEmailNudgePreferenceAction();
  if (!prefResult.success) {
    prefError = prefResult.error;
  } else {
    initialEmailEnabled = prefResult.emailEnabled;
  }

  return (
    <div
      className="min-h-screen bg-gray-50"
      data-testid="notification-settings-page"
    >
      {/* Main content — uses the admin root layout's shell nav (ADR-006 / layout.tsx) */}
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your email notification preferences.
          </p>
        </div>

        {prefError && (
          <div
            role="alert"
            className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {prefError}
          </div>
        )}

        {/* Email suppression toggle — AC-MSG-010-01 */}
        <div
          className="bg-white rounded-lg border border-gray-200 shadow-sm p-6"
          data-testid="email-preferences-section"
        >
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Email Digest Notifications
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            When enabled, you receive a daily email when you have unread portal notifications.
            Turning this off suppresses all email digests — your notifications remain in the portal.
          </p>

          {/* AC-MSG-010-01: toggle bound to the action + current-state read. // AC-MSG-010-01 */}
          <EmailSuppressionToggle initialEmailEnabled={initialEmailEnabled} />
        </div>
      </main>
    </div>
  );
}
