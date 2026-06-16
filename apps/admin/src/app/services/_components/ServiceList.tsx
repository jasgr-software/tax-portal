/**
 * apps/admin/src/app/services/_components/ServiceList.tsx
 *
 * Catalog list component — shows all services (active + inactive) with actions.
 *
 * AC-DASH-010-01: Shows add action that opens AddServiceForm.
 * AC-DASH-010-02: Shows edit action per row that opens EditServiceForm pre-filled.
 * AC-DASH-010-03: Shows deactivate action per active row; inactive rows are visually
 *                 distinguished and have no deactivate control (already inactive).
 *
 * ADR-005: No writes here — all mutations go through server actions (TASK-002-002).
 *          The UI is NOT the security boundary; the policy + server actions enforce.
 * ADR-006: Admin-only component — never imported or rendered in apps/portal.
 *
 * Reactivation is OUT OF SCOPE per task spec — there is no reactivateServiceAction.
 * Inactive rows are rendered distinctly (gray badge, dimmed row) but have no reactivate control.
 */

"use client";

import { useState } from "react";
import type { ServiceItem } from "@tax-portal/db";
import { Button } from "@tax-portal/ui";
import { AddServiceForm } from "./AddServiceForm";
import { EditServiceForm } from "./EditServiceForm";

interface ServiceListProps {
  services: ServiceItem[];
}

export function ServiceList({ services }: ServiceListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);

  return (
    <div className="space-y-6">
      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Services Catalog</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your services — active and inactive. Inactive services are not visible to clients.
          </p>
        </div>
        <Button
          variant="default"
          onClick={() => {
            setShowAddForm(true);
            setEditingService(null);
          }}
          aria-label="Add new service"
        >
          + Add Service
        </Button>
      </div>

      {/* Add form (inline — shown when Add Service is clicked) */}
      {showAddForm && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-blue-900">Add New Service</h2>
          <AddServiceForm
            onSuccess={() => setShowAddForm(false)}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Edit form (inline — replaces add form when editing) */}
      {editingService && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-amber-900">
            Edit Service — {editingService.name}
          </h2>
          <EditServiceForm
            service={editingService}
            onSuccess={() => setEditingService(null)}
            onCancel={() => setEditingService(null)}
          />
        </div>
      )}

      {/* Service table */}
      {services.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No services yet. Click <strong>+ Add Service</strong> to create the first one.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Description
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Sort
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {services.map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  onEdit={() => {
                    setEditingService(service);
                    setShowAddForm(false);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── ServiceRow ────────────────────────────────────────────────────────────────

interface ServiceRowProps {
  service: ServiceItem;
  onEdit: () => void;
}

function ServiceRow({ service, onEdit }: ServiceRowProps) {
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  async function handleDeactivate() {
    if (!window.confirm(`Deactivate "${service.name}"? Clients will no longer see this service.`)) {
      return;
    }
    setIsDeactivating(true);
    setDeactivateError(null);
    try {
      const { deactivateServiceAction } = await import("../actions");
      const result = await deactivateServiceAction(service.id);
      if (!result.success) {
        setDeactivateError(result.error);
      }
      // On success, Next.js revalidatePath('/services') triggers a server re-render
      // which updates this component via the server component parent.
    } catch {
      setDeactivateError("An unexpected error occurred. Please try again.");
    } finally {
      setIsDeactivating(false);
    }
  }

  return (
    <tr
      className={service.active ? "hover:bg-gray-50" : "bg-gray-50 opacity-60"}
      aria-label={`Service: ${service.name}${service.active ? "" : " (inactive)"}`}
    >
      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
        {service.name}
      </td>
      <td className="px-6 py-4 text-sm text-gray-500">
        {service.description ?? <span className="italic text-gray-400">—</span>}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
        {service.sortOrder}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm">
        {service.active ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            Active
          </span>
        ) : (
          <span
            className="inline-flex items-center rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600"
            data-testid="inactive-badge"
          >
            Inactive
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
        <div className="flex items-center justify-end gap-2">
          {deactivateError && (
            <span className="text-xs text-red-600" role="alert">
              {deactivateError}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            aria-label={`Edit ${service.name}`}
          >
            Edit
          </Button>
          {service.active && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                void handleDeactivate();
              }}
              disabled={isDeactivating}
              aria-label={`Deactivate ${service.name}`}
            >
              {isDeactivating ? "Deactivating…" : "Deactivate"}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
