/**
 * apps/portal/src/components/ServiceChecklist.tsx
 *
 * AC-DOOR-003-01: Presents active services as a checklist.
 * AC-DOOR-002-04 / AC-DOOR-003-04: Only active services are rendered as options.
 *                 The props shape itself enforces this — the parent passes only active
 *                 services (from getActiveServices(), which filters at the query level).
 * AC-DOOR-003-02: No freeform "describe your need" textarea replacing the checklist.
 * AC-DOOR-003-03: No service-specific sub-questions that vary by selection.
 * AC-DOOR-004-01: Allows one or more services to be selected.
 *
 * DESIGN: This is a controlled component — the parent (RequestForm) owns selectedIds state.
 * The checklist renders one checkbox per service, nothing more.
 * No conditional rendering based on which services are selected (AC-DOOR-003-03).
 *
 * ADR-006: App-specific component — stays in apps/portal/src/components, not packages/ui.
 */

"use client";

import type React from "react";
import type { ServiceListItem } from "@tax-portal/db";
import { Checkbox } from "@tax-portal/ui";

interface ServiceChecklistProps {
  /** Only active services — caller (server component or form) is responsible for filtering */
  services: ServiceListItem[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  /** Error message to display when validation fails (e.g. zero services selected). Omit when no error. */
  error?: string | undefined;
}

export function ServiceChecklist({
  services,
  selectedIds,
  onChange,
  error,
}: ServiceChecklistProps) {
  function handleChange(serviceId: string, checked: boolean) {
    if (checked) {
      onChange([...selectedIds, serviceId]);
    } else {
      onChange(selectedIds.filter((id) => id !== serviceId));
    }
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-700 mb-3">
        Select the services you are interested in{" "}
        <span className="text-red-500" aria-hidden="true">
          *
        </span>
      </legend>

      {/* AC-DOOR-003-01: Checklist of services — one item per active service, nothing else */}
      {/* AC-DOOR-003-02: No freeform textarea replacing the checklist */}
      {/* AC-DOOR-003-03: No per-service sub-questions — the list is static */}
      <div className="space-y-3">
        {services.map((service) => (
          <Checkbox
            key={service.id}
            id={`service-${service.id}`}
            value={service.id}
            label={service.name}
            checked={selectedIds.includes(service.id)}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(service.id, e.target.checked)}
          />
        ))}
      </div>

      {/* AC-DOOR-004-05: Zero-selection error message */}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}
