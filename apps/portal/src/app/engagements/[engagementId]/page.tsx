/**
 * apps/portal/src/app/engagements/[engagementId]/page.tsx
 *
 * Direct-reference client engagement view — resolves an engagement by id via the
 * sec.pol_Engagement FILTER predicate (request pool, SESSION_CONTEXT set).
 *
 * If the CLIENT does not own the requested engagement AND is not a linked participant,
 * the FILTER returns null and this page renders a 404-style not-found response.
 *
 * TASK-012-005 (multi-participant access):
 *   The sec.pol_Engagement FILTER was extended in TASK-012-001 (DECISION-D) to include
 *   the participant-link branch:
 *     CLIENT branch = (e.clientUserId = me) OR EXISTS(EngagementParticipant ep WHERE ep.engagementId = e.id AND ep.userId = me)
 *   This page does NOT need app-layer filtering changes — the RLS FILTER handles participant
 *   access transparently. A linked participant calling getEngagementForClient will receive
 *   the engagement row (the FILTER grants access via the participant branch).
 *   An unrelated CLIENT still sees ZERO (fail-closed — AC-AUTH-007-03).
 *   This satisfies AC-AUTH-007-03 at the surface level (UI/e2e layer); the tier-3 RLS
 *   proof is in TASK-012-001 (engagement-participant.client-isolation.rls.test.ts).
 *
 * DECISION (TASK-010-004): The dashboard listing covers AC-AUTH-003-01/-02 (a CLIENT
 * sees only their own engagements via getMyEngagement/FILTER). AC-AUTH-003-03 requires
 * a direct-reference path (fetch-by-id) where a CLIENT can navigate to another CLIENT's
 * engagement by supplying the id in the URL. This page provides that test surface:
 * CLIENT-B navigating to /engagements/<CLIENT-A-id> is denied (returns not-found).
 *
 * ADR-003: DB read via withRequestContext(CLIENT identity) — SESSION_CONTEXT set,
 *   FILTER predicate governs row visibility.
 * ADR-005: sec.pol_Engagement FILTER does the isolation — NOT app-layer filtering.
 *   A non-owner, non-participant CLIENT's SESSION_CONTEXT causes the FILTER to return
 *   null (fail-closed). A linked participant's SESSION_CONTEXT passes (DECISION-D).
 * ADR-006: /engagements/[id] is apps/portal only (client read-only surface).
 * ADR-010: /dashboard/engagements/* is NOT public — requires CLIENT session.
 *
 * AC-LIFE-002-01/-02/-03: label mapped via EngagementStatusBadge (NEVER raw status).
 * AC-LIFE-003-03: NO status-change affordance.
 * AC-LIFE-006-02: NO reopen affordance.
 * AC-LIFE-004-02/-03: Review → "In Progress" with no client action required.
 * AC-AUTH-003-03: FILTER denies direct-reference access to another client's engagement.
 * AC-AUTH-007-03: a linked participant can reach the shared engagement through their own
 *   account; an unrelated CLIENT cannot (RLS fail-closed — no app-layer guard needed).
 * AC-AUTH-008-01/-02: Complete engagements remain fully viewable.
 *
 * // ADR-005: FILTER governs isolation on fetch-by-id path (owner + participant branch, TASK-012-001)
 * // ADR-006: portal surface only
 * // CS-TS-001: DB read via withRequestContext (packages/db wrapper)
 * // CS-TS-002: no raw pool import
 * // CS-TS-003: EngagementStatusBadge shared component
 * // CS-GEN-003: cite governing authority in comments
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEngagementByIdAction } from "@/app/dashboard/actions";
import { EngagementStatusBadge } from "@/components/EngagementStatusBadge";
// CS-TS-001: getEngagementByIdAction uses packages/db via withRequestContext

// ─── Route params ─────────────────────────────────────────────────────────────

interface EngagementDetailPageProps {
  params: Promise<{ engagementId: string }>;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Engagement Details",
  description: "Your engagement details.",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EngagementDetailPage({
  params,
}: EngagementDetailPageProps) {
  const { engagementId } = await params;

  // Resolve the engagement by id under the CLIENT's SESSION_CONTEXT.
  // ADR-003: request-scoped DB read — SESSION_CONTEXT set by withRequestContext.
  // ADR-005: sec.pol_Engagement FILTER enforces isolation (fail-closed on non-owner).
  // AC-AUTH-003-03: A CLIENT with another CLIENT's engagement id gets a not_found here.
  // CS-TS-001: getEngagementByIdAction uses packages/db (withRequestContext + getEngagementForClient).
  // CS-TS-002: no raw pool import in this file or in actions.ts.
  const result = await getEngagementByIdAction(engagementId);

  // FILTER returned null → either non-existent OR not owned by this CLIENT.
  // Render 404 — do not leak whether the id exists.
  // AC-AUTH-003-03: direct-reference access to another client's engagement is denied.
  if (!result.success) {
    if (result.error === "unauthorized") {
      return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-8 text-center"
            data-testid="engagement-unauthorized"
          >
            <p className="text-red-700 text-sm">
              Authentication required. Please sign in.
            </p>
          </div>
        </div>
      );
    }
    // "not_found" — either doesn't exist or the FILTER denied access (AC-AUTH-003-03).
    notFound();
  }

  const { engagement } = result;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-6">
        <a
          href="/dashboard"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          ← Back to Dashboard
        </a>
      </div>

      <div
        className="rounded-lg border border-gray-200 bg-white p-8"
        data-testid="engagement-detail"
        data-engagement-id={engagement.id}
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Your Engagement
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Started{" "}
              {engagement.createdAt.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          {/*
            AC-LIFE-002-01/-02/-03: EngagementStatusBadge maps internalStatus to the client-facing
            label via clientFacingLabel. The raw status (especially "Review") NEVER reaches the DOM.
            AC-LIFE-004-02/-03: Review → "In Progress" with no client action implied.
          */}
          <EngagementStatusBadge internalStatus={engagement.status} />
        </div>

        {/*
          AC-LIFE-003-03, AC-LIFE-006-02: NO status-change or reopen affordance.
          Transition and reopen controls live in apps/admin only (ADR-006).
          ADR-010: a CLIENT navigating toward the admin transition surface is redirected.

          AC-AUTH-008-01/-02: This view is accessible even when status is "Complete".
        */}

        <div
          className="mt-4 rounded-md bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600"
          data-testid="engagement-info-panel"
        >
          <p>
            Your tax engagement is currently being managed by your accountant.
            You will be notified when action is needed.
          </p>
        </div>

        <div className="mt-4">
          <a
            href="/dashboard"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            data-testid="back-to-dashboard-link"
          >
            ← Return to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
