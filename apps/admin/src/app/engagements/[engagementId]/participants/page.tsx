/**
 * apps/admin/src/app/engagements/[engagementId]/participants/page.tsx
 *
 * Participants management page for an engagement (Tax Portal — admin).
 *
 * TASK-012-005: Multi-participant invitation + shared access.
 *
 * Acceptance criteria:
 *   AC-LIFE-012-02 — each participant is a separate portal account, not a shared login
 *   AC-LIFE-012-03 — all participants linked to an engagement are listed and associated with it
 *   AC-AUTH-007-01 — one engagement may have more than one CLIENT participant
 *   AC-AUTH-007-02 — each participant has their own distinct account (never shared)
 *
 * ADR-001: own-account invariant — each participant is their own account; invite creates a
 *   new account for the invitee, not a shared login (no shared login is EVER created).
 * ADR-003: reads via admin pool (getAdminPool — accountant surface, RLS-exempt).
 * ADR-005: identity from verified session ONLY — never from URL params or form data.
 * ADR-006: this page is apps/admin ONLY — no mirror in apps/portal.
 * ADR-010: apps/admin has NO public routes; middleware guarantees ACCOUNTANT before this page.
 * ADR-023: invite action uses the mock-first auth seam (getAuthProvider().createInvitation).
 *
 * // ADR-001 // ADR-003 // ADR-005 // ADR-006 // ADR-010 // ADR-023
 * // CS-TS-001 // CS-TS-003 // CS-TS-004 // CS-GEN-003
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { loadParticipants, inviteParticipant } from "./actions";
// CS-TS-001: loadParticipants uses @tax-portal/db barrel (getAdminPool)

// ─── Route params ─────────────────────────────────────────────────────────────

interface ParticipantsPageProps {
  params: Promise<{ engagementId: string }>;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata = {
  title: "Engagement Participants",
};

// ─── Invite form (client-side interactivity via form action) ──────────────────

/**
 * InviteForm — renders the invite control (email input + submit button).
 *
 * The form submits to the inviteParticipant server action directly.
 * The engagementId is passed as a hidden field (server-resolved — not client-trusted in isolation;
 * the action re-reads and validates it from the session context).
 *
 * AC-AUTH-007-01: the accountant can invite additional CLIENT participants to an engagement.
 * ADR-001: the invite always creates the participant's OWN account (no shared login).
 * ADR-023: invite goes through the auth provider mock-first seam.
 *
 * // AC-AUTH-007-01 // ADR-001 // ADR-023
 */
function InviteForm({
  engagementId,
}: {
  engagementId: string;
}) {
  // Server action bound to this form (CS-TS-004: ACCOUNTANT guard inside inviteParticipant)
  const doInvite = inviteParticipant.bind(null, engagementId);

  return (
    <form action={doInvite} className="flex gap-3 items-end">
      <div className="flex-1">
        <label
          htmlFor="inviteeEmail"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Participant email
        </label>
        <input
          type="email"
          id="inviteeEmail"
          name="inviteeEmail"
          required
          placeholder="client@example.com"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                     placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1
                     focus:ring-blue-500"
          data-testid="invite-email-input"
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white
                   hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500
                   focus:ring-offset-2 transition-colors"
        data-testid="invite-submit"
      >
        Invite Participant
      </button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ParticipantsPage({
  params,
}: ParticipantsPageProps) {
  const { engagementId } = await params;

  // Defense-in-depth identity guard — ADR-010 middleware guarantees ACCOUNTANT,
  // but we re-verify here to match the established page pattern.
  // CS-TS-004: ACCOUNTANT guard before any read/write.
  // ADR-005: identity from verified session headers, never from URL params.
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  // CS-TS-004: fail-closed if not ACCOUNTANT
  if (!identity || identity.role !== "ACCOUNTANT") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-red-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Tax Portal</h1>
          <p className="text-sm text-red-600">Authentication required. Please sign in as the accountant.</p>
        </div>
      </div>
    );
  }

  // Load participants via admin pool (RLS-exempt for accountant-surface reads).
  // ADR-003 §7: admin pool is correct for admin-surface reads.
  // CS-TS-001: loadParticipants uses getAdminPool() via @tax-portal/db barrel.
  const participants = await loadParticipants(engagementId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <nav className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <span className="text-base font-bold text-gray-900">Tax Portal</span>
              <nav className="flex gap-4 text-sm" aria-label="Main navigation">
                <a href="/" className="text-gray-500 hover:text-gray-900 transition-colors">
                  Dashboard
                </a>
                <a href="/requests" className="text-gray-500 hover:text-gray-900 transition-colors">
                  Requests
                </a>
                <a href="/engagements" className="text-gray-500 hover:text-gray-900 transition-colors">
                  Engagements
                </a>
              </nav>
            </div>
            <span className="text-xs text-gray-400 font-mono">{identity.clerkUserId}</span>
          </div>
        </div>
      </nav>

      {/* Breadcrumb */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
        <div className="flex items-center gap-2 text-sm">
          <a href="/engagements" className="text-blue-600 hover:text-blue-800 hover:underline">
            ← Engagements
          </a>
          <span className="text-gray-400">/</span>
          <a
            href={`/engagements/${engagementId}`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            {engagementId}
          </a>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600">Participants</span>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Engagement Participants</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage the participants on this engagement. Each participant signs in with their own account.
          </p>
          {/*
            ADR-001: own-account invariant note (visible in UI).
            AC-LIFE-012-02 / AC-AUTH-007-02: each participant has a separate account, not a shared login.
          */}
          <p className="mt-1 text-xs text-gray-400">
            Engagement ID: {engagementId}
          </p>
        </div>

        {/* Participant list — AC-LIFE-012-03: all linked participants */}
        <div
          className="bg-white rounded-lg border border-gray-200 shadow-sm mb-6"
          data-testid="participants-list"
        >
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">
              Linked Participants ({participants.length})
            </h2>
          </div>

          {participants.length === 0 ? (
            <div
              className="px-6 py-8 text-center text-sm text-gray-500"
              data-testid="participants-empty"
            >
              No participants linked yet. Invite a participant below.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200" role="list">
              {participants.map((participant) => (
                <li
                  key={participant.participantId}
                  className="px-6 py-4 flex items-center justify-between"
                  data-testid={`participant-row-${participant.participantId}`}
                >
                  <div>
                    <p
                      className="text-sm font-medium text-gray-900"
                      data-testid={`participant-email-${participant.participantId}`}
                    >
                      {participant.email}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Role: {participant.role} · Linked:{" "}
                      {participant.createdAt.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    Linked
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Invite control — AC-AUTH-007-01: invite additional participants */}
        {/*
          ADR-001: own-account invariant — inviteParticipant action creates a new account
          for the invitee (never a shared login). Each invited participant gets their OWN
          portal account with their own credentials.
          ADR-023: invitation goes through getAuthProvider().createInvitation (mock-first seam).
          AC-LIFE-012-02 / AC-AUTH-007-02: "own account" is the invariant, not "shared login".
        */}
        <div
          className="bg-white rounded-lg border border-gray-200 shadow-sm p-6"
          data-testid="invite-panel"
        >
          <h2 className="text-base font-semibold text-gray-900 mb-1">Invite a Participant</h2>
          <p className="text-sm text-gray-500 mb-4">
            Enter the participant&apos;s email address. They will receive their own account —
            each participant signs in with their own credentials.
          </p>
          {/* ADR-001 // ADR-023 // CS-TS-004 */}
          <InviteForm engagementId={engagementId} />
        </div>

        {/* Link back to engagement */}
        <div className="mt-6">
          <a
            href={`/engagements/${engagementId}`}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← Back to Engagement
          </a>
        </div>
      </main>
    </div>
  );
}
