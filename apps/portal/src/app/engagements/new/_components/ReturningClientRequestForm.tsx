/**
 * apps/portal/src/app/engagements/new/_components/ReturningClientRequestForm.tsx
 * — Client-side form component for the returning-client new-engagement request flow.
 *
 * AC-DOOR-009-01: The form is inside the portal — no redirect to a public URL.
 * AC-DOOR-009-02: Presents only a service checklist — the client selects services.
 * AC-DOOR-009-03: NO contact fields (firstName/lastName/email).
 *   The form's shape itself proves this requirement:
 *   - No <Input name="firstName"> / <Input name="lastName"> / <Input name="email">.
 *   - Contact resolution happens server-side in submitReturningClientRequest (DECISION-E).
 * AC-DOOR-009-04: On submission, the action creates a pending request + notification
 *   routed to the accountant inbox (verified by the cross-app e2e test).
 *
 * ADR-006: Client Component ("use client") — handles checkbox state + submission.
 *   The Server Action (actions.ts) is the actual write path.
 * CS-TS-003: Mirrors RequestForm.tsx — same ServiceChecklist component, same pattern.
 *
 * // CS-TS-003 // ADR-006
 */

"use client";

import { useState, useTransition } from "react";
import type { ServiceListItem } from "@tax-portal/db";
import { Button } from "@tax-portal/ui";
import { ServiceChecklist } from "@/components/ServiceChecklist";
import { submitReturningClientRequest } from "../actions";

interface ReturningClientRequestFormProps {
  /** Only active services — from getActiveServices() on the server */
  services: ServiceListItem[];
}

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; requestId: string }
  | { status: "error"; message: string };

export function ReturningClientRequestForm({
  services,
}: ReturningClientRequestFormProps) {
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [serviceError, setServiceError] = useState<string>("");
  const [formState, setFormState] = useState<FormState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Client-side zero-selection guard (defense in depth; server also validates)
    if (selectedServiceIds.length === 0) {
      setServiceError("Please select at least one service.");
      return;
    }
    setServiceError("");

    const formData = new FormData();
    formData.set("serviceIds", JSON.stringify(selectedServiceIds));
    /*
      AC-DOOR-009-03: Only serviceIds is set in formData — no contact fields.
      The server action reads ONLY serviceIds + the identity cookie.
      This is the form-layer proof of AC-DOOR-009-03.
    */

    startTransition(async () => {
      setFormState({ status: "submitting" });
      try {
        const result = await submitReturningClientRequest(formData);
        if (result.success && result.requestId) {
          setFormState({
            status: "success",
            requestId: result.requestId,
          });
        } else {
          setFormState({
            status: "error",
            message: result.error ?? "An error occurred. Please try again.",
          });
        }
      } catch {
        setFormState({
          status: "error",
          message: "An unexpected error occurred. Please try again.",
        });
      }
    });
  }

  // AC-DOOR-009-04: success state confirms the request has been submitted to the inbox
  if (formState.status === "success") {
    return (
      <div
        role="alert"
        data-testid="returning-request-success"
        className="rounded-lg bg-green-50 border border-green-200 p-8 text-center"
      >
        <div className="text-green-600 text-lg font-semibold mb-2">
          Request Submitted
        </div>
        <p className="text-gray-700">
          Your new engagement request has been received. Your accountant will
          review it and be in touch soon.
        </p>
        <a
          href="/dashboard"
          className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-700"
        >
          Return to Dashboard
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-8"
      data-testid="returning-client-request-form"
    >
      {/*
        AC-DOOR-009-02: Service checklist — same ServiceChecklist component as
        the front-door form (CS-TS-003 cross-surface parity).
        AC-DOOR-009-03: NO contact fields below or above the checklist.
      */}
      <section aria-labelledby="services-section">
        <h2 id="services-section" className="mb-4">
          Services
        </h2>
        <ServiceChecklist
          services={services}
          selectedIds={selectedServiceIds}
          onChange={setSelectedServiceIds}
          error={serviceError}
        />
      </section>

      {/*
        AC-DOOR-009-03: Deliberate absence of contact fields.
        The form has NO firstName, lastName, or email input.
        This is the UI-layer proof that contact is on-file (server resolves it).
      */}

      {formState.status === "error" && (
        <div
          role="alert"
          data-testid="returning-request-error"
          className="rounded-md bg-red-50 border border-red-200 p-4"
        >
          <p className="text-sm text-red-700">{formState.message}</p>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={isPending || formState.status === "submitting"}
        className="w-full sm:w-auto"
        data-testid="submit-request-button"
      >
        {isPending || formState.status === "submitting"
          ? "Submitting…"
          : "Submit Request"}
      </Button>
    </form>
  );
}
