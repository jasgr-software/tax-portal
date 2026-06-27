/**
 * apps/admin/src/app/settings/reminders/page.tsx
 *
 * Accountant-only settings page for global overdue-reminder cadence configuration.
 *
 * TASK-019-002 / BRIEF-019 / EPIC-019
 *
 * AC-DASH-008-01: The accountant can set a global default frequency for overdue
 *   document-request reminders; it is recorded and applies where no override exists. // AC-DASH-008-01
 * AC-MSG-018-03: Overdue reminders are raised at that frequency by default. // AC-MSG-018-03
 *
 * ADR-006: This page is apps/admin ONLY. Cadence configuration is accountant-only.
 *   There is NO mirror route in apps/portal. // ADR-006
 * ADR-010: apps/admin has NO public routes. The middleware guarantees ACCOUNTANT auth
 *   before this page renders.
 *
 * Identity guard: the page delegates to getGlobalDefaultCadenceAction() (CS-TS-004)
 *   before any DB read. If identity is absent or wrong role, the action returns
 *   { success: false } and the page surfaces the error inline.
 *
 * CS-TS-004: identity guard lives in the action (getAccountantIdentity()). // CS-TS-004
 * CS-TS-001: reads go through getGlobalDefaultCadence (admin pool in packages/db). // CS-TS-001
 * CS-GEN-001: no PII in server logs. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 * DECISION-019-B: singleton ReminderSetting row. // DECISION-019-B
 */

import { ReminderCadenceForm } from "./_components/ReminderCadenceForm";
import { getGlobalDefaultCadenceAction } from "./actions";

export const metadata = {
  title: "Reminder Settings",
};

export default async function ReminderSettingsPage() {
  // Read current global default cadence.
  // The action's getAccountantIdentity() (CS-TS-004) guards the ACCOUNTANT role
  // before any DB read. Middleware (ADR-010) is Layer 1; the action guard is Layer 2.
  // AC-DASH-008-01: the recorded global default is readable. // AC-DASH-008-01
  let initialFrequencyDays = 7; // seeded default (DECISION-019-B)
  let loadError: string | null = null;

  const cadenceResult = await getGlobalDefaultCadenceAction();
  if (!cadenceResult.success) {
    loadError = cadenceResult.error;
  } else {
    initialFrequencyDays = cadenceResult.reminderFrequencyDays;
  }

  return (
    <div
      className="min-h-screen bg-gray-50"
      data-testid="reminder-settings-page"
    >
      {/* Main content */}
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Reminder Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure how often overdue document-request reminders are raised.
          </p>
        </div>

        {loadError && (
          <div
            role="alert"
            className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {loadError}
          </div>
        )}

        {/* Global default cadence form — AC-DASH-008-01 */}
        <div
          className="bg-white rounded-lg border border-gray-200 shadow-sm p-6"
          data-testid="reminder-cadence-section"
        >
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Global Default Reminder Frequency
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            How often overdue document-request reminders are raised (in days).
            This applies to all engagements that do not have a per-engagement override set.
          </p>

          {/* AC-DASH-008-01: form bound to the setGlobalDefaultCadenceAction. // AC-DASH-008-01 */}
          <ReminderCadenceForm initialFrequencyDays={initialFrequencyDays} />
        </div>

        {/* Navigation link back to settings */}
        <div className="mt-6">
          <a
            href="/settings"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← Back to Settings
          </a>
        </div>
      </main>
    </div>
  );
}
