/**
 * apps/admin/src/app/services/_components/EditServiceForm.tsx
 *
 * Client component — form to edit an existing service in the catalog.
 *
 * AC-DASH-010-02: Accountant can edit a service from the admin UI.
 *                 Form pre-fills with the current service values.
 *                 On submit, calls updateServiceAction (TASK-002-002 server action).
 *                 On success the parent closes the form panel.
 *                 On error the error string from the discriminated union is displayed.
 *
 * ADR-005: Writes go through updateServiceAction (server action) — never direct DB access.
 */

"use client";

import { useState, useTransition } from "react";
import type { ServiceItem } from "@tax-portal/db";
import { Button } from "@tax-portal/ui";
import { Input } from "@tax-portal/ui";
import { updateServiceAction } from "../actions";

interface EditServiceFormProps {
  /** The service to edit — used to pre-fill the form. */
  service: ServiceItem;
  /** Called when the service is successfully updated. */
  onSuccess: () => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

export function EditServiceForm({ service, onSuccess, onCancel }: EditServiceFormProps) {
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(service.sortOrder));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateServiceAction({
        id: service.id,
        name,
        description: description || null,
        sortOrder: sortOrder !== "" ? Number(sortOrder) : 0,
      });

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-label="Edit service form">
      {error && (
        <div
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label
            htmlFor={`edit-name-${service.id}`}
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            Service Name <span className="text-red-500">*</span>
          </label>
          <Input
            id={`edit-name-${service.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            disabled={isPending}
            aria-required="true"
          />
        </div>

        <div className="sm:col-span-1">
          <label
            htmlFor={`edit-description-${service.id}`}
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            Description
          </label>
          <Input
            id={`edit-description-${service.id}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
            disabled={isPending}
          />
        </div>

        <div>
          <label
            htmlFor={`edit-sort-order-${service.id}`}
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            Sort Order
          </label>
          <Input
            id={`edit-sort-order-${service.id}`}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            disabled={isPending}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="default" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
