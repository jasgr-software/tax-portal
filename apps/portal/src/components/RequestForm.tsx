/**
 * apps/portal/src/components/RequestForm.tsx
 *
 * AC-DOOR-003-01: Presents a service checklist (via ServiceChecklist child).
 * AC-DOOR-003-02: No freeform "describe your need" textarea replacing the checklist.
 * AC-DOOR-003-03: No service-specific sub-questions that vary by selection.
 * AC-DOOR-004-01: Allows one or more services to be selected.
 * AC-DOOR-004-02: Provides basic contact fields (firstName, lastName, email — see DECISION below).
 * AC-DOOR-004-05: Cannot submit with zero services selected — client-side guard.
 *
 * // DECISION: Contact field set = firstName + lastName + email.
 * //   Rationale: Minimal PII needed for the accountant to identify and respond to the prospect.
 * //   firstName + lastName: needed to address the client in the accept/decline email (EPIC-003).
 * //   email: needed for the accountant to respond (primary contact method for a tax portal).
 * //   phone: optional — not required here; EPIC-003 can add it when the inbox needs it.
 * //   Note for EPIC-003: the accountant inbox reads firstName, lastName, email from
 * //   EngagementRequest; match the CreateEngagementRequestInput shape in @tax-portal/db.
 *
 * ADR-006: Client Component ("use client") — handles checkbox state + client-side validation.
 *          The Server Action (actions.ts) is the actual write path.
 * REQ-DOOR-004: No sign-in required; the form is fully anonymous.
 */

"use client";

import { useState, useTransition } from "react";
import type { ServiceListItem } from "@tax-portal/db";
import { Button, Input, Label } from "@tax-portal/ui";
import { ServiceChecklist } from "./ServiceChecklist";
import { submitEngagementRequest } from "@/app/(public)/request/actions";

interface RequestFormProps {
  /** Only active services — from getActiveServices() on the server */
  services: ServiceListItem[];
}

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; requestId: string }
  | { status: "error"; message: string };

export function RequestForm({ services }: RequestFormProps) {
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [serviceError, setServiceError] = useState<string>("");
  const [formState, setFormState] = useState<FormState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // AC-DOOR-004-05: Client-side zero-selection guard
    if (selectedServiceIds.length === 0) {
      setServiceError("Please select at least one service.");
      return;
    }
    setServiceError("");

    const formData = new FormData(e.currentTarget);
    formData.set("serviceIds", JSON.stringify(selectedServiceIds));

    startTransition(async () => {
      setFormState({ status: "submitting" });
      try {
        const result = await submitEngagementRequest(formData);
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

  if (formState.status === "success") {
    return (
      <div
        role="alert"
        className="rounded-lg bg-green-50 border border-green-200 p-8 text-center"
      >
        <div className="text-green-600 text-lg font-semibold mb-2">
          Request Submitted
        </div>
        <p className="text-gray-700">
          Thank you for your interest. We have received your request and will be
          in touch soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {/* AC-DOOR-003-01: Service checklist */}
      {/* AC-DOOR-003-02: No freeform textarea below or instead of this checklist */}
      {/* AC-DOOR-003-03: No per-service sub-questions rendered based on selection */}
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

      {/* AC-DOOR-004-02: Basic contact fields */}
      {/* DECISION: firstName + lastName + email (see file header for rationale) */}
      <section aria-labelledby="contact-section" className="space-y-4">
        <h2 id="contact-section">Contact Information</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="firstName">
              First Name{" "}
              <span className="text-red-500" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              required
              placeholder="Jane"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="lastName">
              Last Name{" "}
              <span className="text-red-500" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              required
              placeholder="Smith"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="email">
            Email Address{" "}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="jane.smith@example.com"
          />
        </div>
      </section>

      {formState.status === "error" && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700">
            {formState.message}
          </p>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={isPending || formState.status === "submitting"}
        className="w-full sm:w-auto"
      >
        {isPending || formState.status === "submitting"
          ? "Submitting…"
          : "Submit Request"}
      </Button>
    </form>
  );
}
