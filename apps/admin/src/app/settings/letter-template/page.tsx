/**
 * apps/admin/src/app/settings/letter-template/page.tsx
 *
 * Accountant-only setting page for the engagement-letter template.
 *
 * AC-IDNT-007-01: Renders the system-seeded default template content on first open;
 *   no authoring required — the default is present out-of-box.
 * AC-IDNT-007-02: The accountant edits the template via the TemplateEditor component
 *   and saves; the persisted content is returned on re-read.
 *
 * ADR-006: This page is apps/admin ONLY. There is NO mirror route in apps/portal.
 *   Template editing is an accountant setting — clients never reach this surface.
 *
 * ADR-010: apps/admin has NO public routes. The middleware guarantees ACCOUNTANT auth
 *   before this page renders. This page adds a defense-in-depth identity guard.
 *
 * Pool strategy: reads via getLetterTemplateAction() → getCurrentLetterTemplate()
 *   → admin pool (LetterTemplate is not client-readable; no RLS policy — DECISION-D).
 *   No withRequestContext needed for the template read.
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { TemplateEditor } from "./_components/TemplateEditor";
import { getLetterTemplateAction } from "./actions";

export const metadata = {
  title: "Engagement Letter Template",
};

export default async function LetterTemplatePage() {
  // Defense-in-depth identity guard — ADR-010 middleware guarantees ACCOUNTANT,
  // but we re-verify here to match the established page pattern (services/page.tsx).
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

  // Load the current template (seeded default or last-saved edit).
  // On DB error: render the editor with null content + error banner rather than crashing.
  let templateContent: string | null = null;
  let dbError: string | null = null;

  const templateResult = await getLetterTemplateAction();
  if (!templateResult.success) {
    dbError = templateResult.error;
  } else {
    templateContent = templateResult.data?.content ?? null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple top nav — mirrors services/page.tsx pattern */}
      <nav className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <span className="text-base font-bold text-gray-900">Tax Portal</span>
              <nav className="flex gap-4 text-sm" aria-label="Main navigation">
                <a
                  href="/"
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Dashboard
                </a>
                <a
                  href="/requests"
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Requests
                </a>
                <a
                  href="/services"
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Services
                </a>
                <a
                  href="/settings/letter-template"
                  className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  aria-current="page"
                >
                  Letter Template
                </a>
              </nav>
            </div>
            <span className="text-xs text-gray-400 font-mono">{identity.clerkUserId}</span>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Engagement Letter Template</h1>
          <p className="mt-1 text-sm text-gray-500">
            Edit the engagement letter that clients will be presented to sign during onboarding.
            The content below is plain text / Markdown.
          </p>
        </div>

        {dbError && (
          <div
            role="alert"
            className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {dbError}
          </div>
        )}

        {/* templateContent === null means unseeded DB — TemplateEditor renders with empty placeholder */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <TemplateEditor initialContent={templateContent} />
        </div>
      </main>
    </div>
  );
}
