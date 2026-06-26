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
 *   before this page renders.
 *
 * Identity guard: the page delegates to getOwnEmailNudgePreferenceAction(), which
 *   calls getAccountantIdentity() (CS-TS-004) before any DB read. If identity is
 *   absent or wrong role, the action returns { success: false } and the page
 *   surfaces the error inline. The page does not re-implement the guard itself —
 *   middleware (Layer 1) + the action's guard (Layer 2) are sufficient.
 *
 * CS-TS-004: identity guard lives in the action (getAccountantIdentity()).   // CS-TS-004
 * CS-TS-001: current preference read via withRequestContext (SESSION_CONTEXT set). // CS-TS-001
 * CS-GEN-001: no PII in server logs. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */

import { EmailSuppressionToggle } from "./_components/EmailSuppressionToggle";
import { getOwnEmailNudgePreferenceAction } from "./actions";

export const metadata = {
  title: "Notification Settings",
};

export default async function NotificationSettingsPage() {
  // Read the accountant's current email preference.
  // The action's getAccountantIdentity() (CS-TS-004) guards the ACCOUNTANT role
  // before any DB read. If auth fails, prefResult.success === false and the error
  // is surfaced inline. Middleware (ADR-010) is Layer 1; the action guard is Layer 2.
  // AC-MSG-011-01: default-on if row absent (returned by getEmailNudgePreferenceForCurrentUser). // AC-MSG-011-01
  // CS-TS-001: wrapped read via withRequestContext. // CS-TS-001
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
