/**
 * apps/admin/src/app/services/_components/AddServiceForm.tsx
 *
 * Client component — form to create a new service in the catalog.
 *
 * AC-DASH-010-01: Accountant can add a service from the admin UI.
 *                 Form submits to createServiceAction (TASK-002-002 server action).
 *                 On success the form clears and the parent closes the form panel.
 *                 On error the error string from the discriminated union is displayed.
 *
 * ADR-005: Writes go through createServiceAction (server action) — never direct DB access.
 * The server action validates and enforces role; the UI is defense-in-depth display only.
 */

"use client";

import { useState, useTransition } from "react";
import { Button } from "@tax-portal/ui";
import { Input } from "@tax-portal/ui";
import { createServiceAction } from "../actions";

interface AddServiceFormProps {
  /** Called when the service is successfully created (parent closes the form). */
  onSuccess: () => void;
  /** Called when the user cancels without saving. */
  onCancel: () => void;
}

export function AddServiceForm({ onSuccess, onCancel }: AddServiceFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createServiceAction({
        name,
        ...(description ? { description } : {}),
        sortOrder: sortOrder !== "" ? Number(sortOrder) : 0,
      });

      if (result.success) {
        // Reset form state and notify parent
        setName("");
        setDescription("");
        setSortOrder("0");
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-label="Add service form">
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
          <label htmlFor="add-name" className="mb-1 block text-xs font-medium text-gray-700">
            Service Name <span className="text-red-500">*</span>
          </label>
          <Input
            id="add-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Individual Tax Return"
            required
            maxLength={200}
            disabled={isPending}
            aria-required="true"
          />
        </div>

        <div className="sm:col-span-1">
          <label htmlFor="add-description" className="mb-1 block text-xs font-medium text-gray-700">
            Description
          </label>
          <Input
            id="add-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
            disabled={isPending}
          />
        </div>

        <div>
          <label htmlFor="add-sort-order" className="mb-1 block text-xs font-medium text-gray-700">
            Sort Order
          </label>
          <Input
            id="add-sort-order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            placeholder="0"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="default" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Add Service"}
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
