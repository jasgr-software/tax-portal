/**
 * apps/portal/src/app/onboarding/page.tsx — Client onboarding page (protected route)
 *
 * This is a CLIENT-only private route. The middleware (applyPortalAuth) enforces:
 *   - Unauthenticated → redirect to /sign-in
 *   - ACCOUNTANT session → redirect to apps/admin (ADR-010 redirect matrix)
 *   - CLIENT session → serve this page
 *
 * ADR-006: /onboarding is NOT in PORTAL_PUBLIC_PATHS — it requires a CLIENT session.
 *   This route must not exist or be reachable from apps/admin (ADR-006 surface boundary).
 * ADR-001/ADR-005: CLIENT identity is resolved server-side from the verified session cookie
 *   (via getClientIdentity() in actions.ts). The page NEVER receives an engagement id from
 *   the client — engagement resolution is FILTER-governed (getMyEngagement via TASK-005-006).
 *
 * AC-ONBD-001-01: Renders exactly three ordered steps.
 * AC-ONBD-001-03: Current position + remaining steps visible.
 * AC-IDNT-007-03 UI: Letter content (accountant's edited template) displayed in the letter step.
 *
 * // DECISION (TASK-005-006): The page uses getMyOnboardingAction() (no-arg) rather than
 * // getOnboardingAction(id). The engagement id is resolved server-side via FILTER predicate.
 * // No id from URL param, form data, or any client-supplied source (ADR-001/ADR-005).
 *
 * Note: This page is a server component — it calls the server action directly at render time.
 * (Server components can call server-side functions directly; they do not need to invoke
 * "use server" actions via client form actions.)
 */

import type { Metadata } from "next";
import { getMyOnboardingAction } from "./actions";
import { OnboardingSequence } from "./_components/OnboardingSequence";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "Complete your onboarding steps to get started.",
};

export default async function OnboardingPage() {
  // Resolve the client's onboarding state server-side — no id from the client.
  // DECISION (TASK-005-006): uses no-arg path; engagement id never from URL/form/body.
  const result = await getMyOnboardingAction();

  // Error state — no engagement found (not yet set up, or non-CLIENT identity).
  // Middleware ensures only CLIENT sessions reach this page; this is a belt-and-suspenders guard.
  if (!result.success) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center"
          data-testid="onboarding-not-found"
        >
          <h1 className="text-xl font-semibold text-amber-900 mb-2">
            Onboarding Not Available
          </h1>
          <p className="text-sm text-amber-700">
            {result.error === "No active engagement found"
              ? "Your onboarding materials are being prepared. Please check back shortly."
              : "Something went wrong. Please sign in and try again."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <OnboardingSequence
      model={result.data}
      letterContent={result.letterContent}
    />
  );
}
