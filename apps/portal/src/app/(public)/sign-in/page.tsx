/**
 * apps/portal/src/app/(public)/sign-in/page.tsx — Client Portal sign-in page
 *
 * AC-AUTH-005-02: A CLIENT can complete sign-in WITHOUT enrolling a second factor.
 *                 No 2FA step — 2FA is deferred this slice. Do not add MFA here.
 *
 * ADR-010: /sign-in is in PORTAL_PUBLIC_PATHS — accessible unauthenticated.
 * ADR-005: Role is established SERVER-SIDE (signed mock cookie via the server action).
 *
 * This is the CLIENT-facing sign-in surface only. The ACCOUNTANT sign-in lives
 * in apps/admin (TASK-004-006, TASK-004-008).
 *
 * DECISION (TASK-004-005): The sign-in form posts to the signInAsClient server action.
 * Under AUTH_PROVIDER=mock, any non-empty credentials produce a CLIENT session.
 * Under AUTH_PROVIDER=clerk (production), the Clerk binding takes over.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signInAsClient } from "./actions";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your client account to access your tax portal.",
};

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Sign In to Your Account
          </h1>
          <p className="text-gray-600 text-sm">
            Access your client portal to manage your tax engagement.
          </p>
          {/* No 2FA messaging — 2FA is deferred */}
        </div>

        <SignInForm />
      </div>
    </div>
  );
}

// ─── Sign-in form ─────────────────────────────────────────────────────────────

/**
 * SignInForm — server action–driven sign-in form.
 *
 * AC-AUTH-005-02: No second factor step. Form submits email + password only.
 * ADR-005: Session established server-side; role never read from form inputs.
 *
 * DECISION (TASK-004-005): No "Create account" link — per AC-AUTH-006-02, there
 * is no self-service registration path. New users must use the invitation link.
 */
function SignInForm() {
  async function handleSignIn(formData: FormData) {
    "use server";
    const result = await signInAsClient(formData);
    if (result.success && result.redirectTo) {
      redirect(result.redirectTo);
    }
    // On error, the page re-renders (in a full UX, we'd use useFormState)
    // DECISION (TASK-004-005): for the AC-satisfying minimal implementation,
    // success → redirect; error → implicit re-render.
  }

  return (
    <form action={handleSignIn} data-testid="signin-form">
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
            autoComplete="current-password"
            required
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
            placeholder="Enter your password"
            data-testid="password-input"
          />
          {/* No 2FA prompt — 2FA is deferred per AC-AUTH-005-02 */}
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          data-testid="signin-submit-button"
        >
          Sign In
        </button>
      </div>

      {/* AC-AUTH-006-02: no "Create account" / "Register" link — invitation only */}
      <p className="mt-4 text-center text-sm text-gray-500">
        New client?{" "}
        <span className="text-gray-400" data-testid="invitation-only-notice">
          Use the invitation link from your accountant.
        </span>
      </p>
    </form>
  );
}
