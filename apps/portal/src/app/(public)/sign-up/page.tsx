/**
 * apps/portal/src/app/(public)/sign-up/page.tsx — Invitation-landing sign-up page
 *
 * AC-AUTH-006-01: A CLIENT account can be created ONLY via an accountant-issued invitation.
 * AC-AUTH-006-02: There is NO public or self-service registration path.
 * AC-AUTH-005-02: Sign-up completes without a second factor (2FA deferred this slice).
 *
 * ADR-010: /sign-up is in PORTAL_PUBLIC_PATHS — accessible unauthenticated.
 * ADR-005: Role is NEVER client-asserted; the invitation ticket is the only path.
 *
 * Rendering logic:
 *   - If `?ticket=<value>` is present in the URL → render the sign-up form.
 *   - If ticket is absent → render the "invitation required" state (AC-AUTH-006-02 gate).
 *
 * DECISION (TASK-004-005): We accept the invitation ticket via the `ticket` query param.
 * In the Clerk production flow, Clerk sends the invitation link as
 *   https://portal.example.com/sign-up?ticket=<clerk_invitation_token>
 * The query param name `ticket` mirrors that convention. Under AUTH_PROVIDER=mock,
 * the fixture ticket is FIXTURE_INVITATION.ticket ("mock-fixture-ticket-client-001").
 *
 * No 2FA step — 2FA is deferred. Do not add an MFA/OTP step here.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signUpWithInvitation } from "./actions";

export const metadata: Metadata = {
  title: "Create Your Account",
  description:
    "Accept your accountant's invitation and create your secure client account.",
};

// Force dynamic rendering — this page reads query params and must not be cached.
export const dynamic = "force-dynamic";

interface SignUpPageProps {
  searchParams: Promise<{ ticket?: string }>;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const ticket = params.ticket ?? "";

  // AC-AUTH-006-02: no ticket → render the "invitation required" state.
  // The page exists but creates NO account without a valid ticket.
  if (!ticket) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
          <div className="mb-6">
            {/* Lock icon (no 2FA implication — just indicates access control) */}
            <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Invitation Required
            </h1>
            {/* AC-AUTH-006-02: no self-service registration path */}
            <p
              className="text-gray-600 text-sm"
              data-testid="invitation-required-message"
            >
              Client accounts can only be created via an invitation from your
              accountant. There is no self-service registration.
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              If you received an invitation email, please use the link in that
              email to access this page with your invitation token.
            </p>
            <a
              href="/services"
              className="inline-block text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Browse our services
            </a>
          </div>
        </div>
      </div>
    );
  }

  // A ticket is present — render the sign-up form.
  // The server action (signUpWithInvitation) validates the ticket and creates
  // the session only if the ticket is valid. No 2FA step.
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Create Your Client Account
          </h1>
          <p className="text-gray-600 text-sm">
            You have been invited to create a client account. Complete the form
            below to get started.
          </p>
          {/* No 2FA messaging — 2FA is deferred */}
        </div>

        <SignUpForm ticket={ticket} />
      </div>
    </div>
  );
}

// ─── Sign-up form (Client Component) ─────────────────────────────────────────

/**
 * SignUpForm — client component rendering the invitation sign-up form.
 *
 * AC-AUTH-005-02: No second factor step. Form submits email + ticket to the server action.
 * ADR-005: The ticket is validated server-side; the role is set by the server action.
 *
 * The ticket is passed as a hidden field — it cannot be forged because the server
 * action validates it against the known fixture/valid invitation set.
 *
 * DECISION (TASK-004-005): We use a standard HTML form + server action (Next.js 15
 * "use server") for the sign-up flow. This keeps the role derivation server-side
 * without any client-side JS role assertion.
 */
function SignUpForm({ ticket }: { ticket: string }) {
  async function handleSignUp(formData: FormData) {
    "use server";
    const result = await signUpWithInvitation(formData);
    if (result.success && result.redirectTo) {
      redirect(result.redirectTo);
    }
    // On error — re-render with error state
    // (In the full UX, this would use useFormState; here we redirect or re-render server-side)
    // DECISION (TASK-004-005): for the minimal AC-satisfying implementation, we redirect on
    // success and let the page re-render with an error for invalid tickets.
  }

  return (
    <form action={handleSignUp} data-testid="signup-form">
      {/* Hidden invitation ticket — validated server-side */}
      <input type="hidden" name="ticket" value={ticket} />

      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
            placeholder="you@example.com"
            data-testid="email-input"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
            placeholder="Choose a strong password"
            data-testid="password-input"
          />
          {/* No 2FA step after password — 2FA is deferred */}
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          data-testid="signup-submit-button"
        >
          Create Account
        </button>
      </div>

      <p className="mt-4 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <a href="/sign-in" className="text-blue-600 hover:text-blue-700 font-medium">
          Sign in
        </a>
      </p>
    </form>
  );
}
