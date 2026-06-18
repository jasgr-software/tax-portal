/**
 * apps/admin/src/app/settings/questionnaire-templates/page.tsx
 *
 * Accountant-only setting page for managing per-service-type intake questionnaire templates.
 *
 * AC-DASH-012-01: The accountant can create a new template for a service type.
 * AC-DASH-012-02: Each template is bound to a specific service type (serviceId).
 * AC-DASH-012-03: The accountant can edit an existing template; edited content is retained.
 * AC-ONBD-003-02: Two service types carry distinct templates (keyed by serviceId, no cross-contamination).
 *
 * ADR-006: This page is apps/admin ONLY. There is NO mirror route in apps/portal.
 *   Template management is an accountant setting — clients never reach this surface.
 *
 * ADR-010: apps/admin has NO public routes. The middleware guarantees ACCOUNTANT auth
 *   before this page renders. This page adds a defense-in-depth identity guard.
 *
 * Pool strategy: reads via listServicesForTemplatesAction() → listAllServices() → admin pool.
 *   Initial template load via getQuestionnaireTemplateAction() → getTemplateForService() → admin pool.
 *   (QuestionnaireTemplate is not client-readable; no RLS FILTER — DECISION-G).
 *   No withRequestContext needed for admin-pool reads.
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { QuestionnaireTemplateEditor } from "./_components/QuestionnaireTemplateEditor";
import { listServicesForTemplatesAction, getQuestionnaireTemplateAction } from "./actions";
import type { QuestionDef } from "@tax-portal/db";

export const metadata = {
  title: "Questionnaire Templates",
};

/** Parse the serialized questions JSON from the repository into a QuestionDef array. */
function parseQuestionsJson(json: string | null | undefined): QuestionDef[] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as QuestionDef[];
  } catch {
    return null;
  }
}

export default async function QuestionnaireTemplatesPage() {
  // Defense-in-depth identity guard — ADR-010 middleware guarantees ACCOUNTANT,
  // but we re-verify here to match the established page pattern (letter-template/page.tsx).
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

  // Load the catalog services list.
  // On error: render a top-level error banner (cannot proceed without services).
  const servicesResult = await listServicesForTemplatesAction();

  if (!servicesResult.success) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center">
              <span className="text-base font-bold text-gray-900">Tax Portal</span>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
          <div
            role="alert"
            className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {servicesResult.error}
          </div>
        </main>
      </div>
    );
  }

  const services = servicesResult.data;
  const firstServiceId = services[0]?.id ?? null;

  // Load the template for the first service (if any services exist).
  let initialQuestions: QuestionDef[] | null = null;
  let dbError: string | null = null;

  if (firstServiceId) {
    const templateResult = await getQuestionnaireTemplateAction(firstServiceId);
    if (!templateResult.success) {
      dbError = templateResult.error;
    } else {
      initialQuestions = parseQuestionsJson(templateResult.data?.questions);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple top nav — mirrors letter-template/page.tsx */}
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
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Letter Template
                </a>
                <a
                  href="/settings/questionnaire-templates"
                  className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  aria-current="page"
                >
                  Questionnaire Templates
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
          <h1 className="text-2xl font-bold text-gray-900">Questionnaire Templates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Author and maintain per-service intake questionnaires. Select a service type to view
            or edit its question set.
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

        {services.length === 0 ? (
          <div className="rounded border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            No active services found. Add a service first before authoring questionnaire templates.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <QuestionnaireTemplateEditor
              services={services}
              initialServiceId={firstServiceId}
              initialQuestions={initialQuestions}
            />
          </div>
        )}
      </main>
    </div>
  );
}
