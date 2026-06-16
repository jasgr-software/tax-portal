/**
 * apps/admin/src/app/services/catalog-management.test.tsx
 *
 * Tier 2/5 component tests for the services catalog management UI.
 *
 * AC-DASH-010-01: Accountant can add a service from the admin UI.
 * AC-DASH-010-02: Accountant can edit a service from the admin UI (form pre-filled).
 * AC-DASH-010-03: Accountant can deactivate a service; row shown inactive afterwards.
 *
 * Tests specified in task's "Tests to Write First":
 *   1. catalog screen lists active and inactive services (inactive visually distinguished)
 *   2. add form submits to createServiceAction
 *   3. edit form pre-fills and submits to updateServiceAction
 *   4. deactivate control invokes deactivateServiceAction; row shown inactive
 *
 * Strategy:
 *   - Render client components directly (ServiceList, AddServiceForm, EditServiceForm).
 *   - Mock server actions — tests focus on component behavior, not DB or server plumbing.
 *   - vi.hoisted() + vi.mock() pattern mirrors actions.test.ts in this workspace.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ServiceItem } from "@tax-portal/db";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const { mockCreateServiceAction, mockUpdateServiceAction, mockDeactivateServiceAction } =
  vi.hoisted(() => ({
    mockCreateServiceAction: vi.fn(),
    mockUpdateServiceAction: vi.fn(),
    mockDeactivateServiceAction: vi.fn(),
  }));

// ─── Mock the server actions ──────────────────────────────────────────────────
//
// DECISION: We mock the actions module so component tests do not need a DB or Next.js
// server environment. The server actions are tested in actions.test.ts.
// Dynamic import in ServiceRow calls `import("../actions.js")` for the deactivate path —
// we also need to mock that via the standard vi.mock path.

vi.mock("@/app/services/actions", () => ({
  createServiceAction: mockCreateServiceAction,
  updateServiceAction: mockUpdateServiceAction,
  deactivateServiceAction: mockDeactivateServiceAction,
}));

// Also mock the relative import used in ServiceRow's dynamic import and direct imports
// from within _components (they import from "../actions" which resolves to this module)
vi.mock("../actions", () => ({
  createServiceAction: mockCreateServiceAction,
  updateServiceAction: mockUpdateServiceAction,
  deactivateServiceAction: mockDeactivateServiceAction,
}));

// Mock next/navigation (used transitively in some Next.js client components)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/services",
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { ServiceList } from "./_components/ServiceList.js";
import { AddServiceForm } from "./_components/AddServiceForm.js";
import { EditServiceForm } from "./_components/EditServiceForm.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTIVE_SERVICE: ServiceItem = {
  id: "svc-001",
  name: "Individual Tax Return",
  description: "1040 preparation",
  active: true,
  sortOrder: 1,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const INACTIVE_SERVICE: ServiceItem = {
  id: "svc-002",
  name: "Business Tax Return",
  description: "S-Corp/LLC return",
  active: false,
  sortOrder: 2,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

const ACTIVE_SERVICE_2: ServiceItem = {
  id: "svc-003",
  name: "Quarterly Estimated Taxes",
  description: null,
  active: true,
  sortOrder: 3,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

// ─── Test suite ───────────────────────────────────────────────────────────────

// ── Test 1: Catalog screen lists active and inactive services ──────────────────
describe("[AC-DASH-010] catalog screen lists active and inactive services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders active and inactive services", () => {
    render(<ServiceList services={[ACTIVE_SERVICE, INACTIVE_SERVICE]} />);

    // Both services are shown
    expect(screen.getByText("Individual Tax Return")).toBeInTheDocument();
    expect(screen.getByText("Business Tax Return")).toBeInTheDocument();
  });

  it("shows Active badge for active services and Inactive badge for inactive services", () => {
    render(<ServiceList services={[ACTIVE_SERVICE, INACTIVE_SERVICE]} />);

    // Active badge visible
    expect(screen.getByText("Active")).toBeInTheDocument();

    // Inactive badge visible — inactive services are visually distinguished
    const inactiveBadge = screen.getByTestId("inactive-badge");
    expect(inactiveBadge).toBeInTheDocument();
    expect(inactiveBadge).toHaveTextContent("Inactive");
  });

  it("renders multiple active and multiple inactive services all in one list", () => {
    const inactiveService2: ServiceItem = {
      ...INACTIVE_SERVICE,
      id: "svc-004",
      name: "Tax Planning Consultation",
    };
    render(
      <ServiceList services={[ACTIVE_SERVICE, ACTIVE_SERVICE_2, INACTIVE_SERVICE, inactiveService2]} />
    );

    expect(screen.getByText("Individual Tax Return")).toBeInTheDocument();
    expect(screen.getByText("Quarterly Estimated Taxes")).toBeInTheDocument();
    expect(screen.getByText("Business Tax Return")).toBeInTheDocument();
    expect(screen.getByText("Tax Planning Consultation")).toBeInTheDocument();

    // Two active badges, two inactive badges
    const activeBadges = screen.getAllByText("Active");
    expect(activeBadges).toHaveLength(2);
    const inactiveBadges = screen.getAllByTestId("inactive-badge");
    expect(inactiveBadges).toHaveLength(2);
  });

  it("shows empty state when no services exist", () => {
    render(<ServiceList services={[]} />);
    expect(screen.getByText(/no services yet/i)).toBeInTheDocument();
  });

  it("shows Add Service button", () => {
    render(<ServiceList services={[ACTIVE_SERVICE]} />);
    expect(screen.getByRole("button", { name: /add new service/i })).toBeInTheDocument();
  });

  it("inactive row has no Deactivate button — already inactive (reactivation out of scope)", () => {
    render(<ServiceList services={[INACTIVE_SERVICE]} />);

    // No deactivate button for inactive service
    expect(
      screen.queryByRole("button", { name: /deactivate business tax return/i })
    ).not.toBeInTheDocument();
  });

  it("active row has Edit and Deactivate buttons", () => {
    render(<ServiceList services={[ACTIVE_SERVICE]} />);

    expect(
      screen.getByRole("button", { name: /edit individual tax return/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /deactivate individual tax return/i })
    ).toBeInTheDocument();
  });

  it("inactive row has Edit button but no Deactivate button", () => {
    render(<ServiceList services={[INACTIVE_SERVICE]} />);

    expect(
      screen.getByRole("button", { name: /edit business tax return/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /deactivate business tax return/i })
    ).not.toBeInTheDocument();
  });
});

// ── Test 2: Add form submits to createServiceAction ────────────────────────────
describe("[AC-DASH-010-01] add form submits to createServiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateServiceAction.mockResolvedValue({
      success: true,
      data: { ...ACTIVE_SERVICE, name: "New Service" },
    });
  });

  it("renders name, description, and sort order fields", () => {
    render(<AddServiceForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText(/service name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sort order/i)).toBeInTheDocument();
  });

  it("submits createServiceAction with form values", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<AddServiceForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText(/service name/i), "New Service");
    await user.type(screen.getByLabelText(/description/i), "A new service");
    await user.clear(screen.getByLabelText(/sort order/i));
    await user.type(screen.getByLabelText(/sort order/i), "5");

    await user.click(screen.getByRole("button", { name: /add service/i }));

    await waitFor(() => {
      expect(mockCreateServiceAction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Service",
          description: "A new service",
          sortOrder: 5,
        })
      );
    });
  });

  it("calls onSuccess after successful submission", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<AddServiceForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText(/service name/i), "New Service");
    await user.click(screen.getByRole("button", { name: /add service/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  it("displays error message when createServiceAction returns { success: false }", async () => {
    // Server action returns an error (e.g. name too long at the server layer)
    mockCreateServiceAction.mockResolvedValue({
      success: false,
      error: "Service name must be 200 characters or fewer",
    });

    const user = userEvent.setup();
    render(<AddServiceForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    // Fill in a name so the HTML5 required constraint is satisfied; server action
    // returns a failure despite a value being present (simulates a server-side rejection).
    await user.type(screen.getByLabelText(/service name/i), "Some Service");
    await user.click(screen.getByRole("button", { name: /add service/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("alert")
      ).toHaveTextContent("Service name must be 200 characters or fewer");
    });
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<AddServiceForm onSuccess={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(mockCreateServiceAction).not.toHaveBeenCalled();
  });

  it("opens add form when + Add Service is clicked on ServiceList", async () => {
    const user = userEvent.setup();
    render(<ServiceList services={[ACTIVE_SERVICE]} />);

    await user.click(screen.getByRole("button", { name: /add new service/i }));

    // Add form appears
    expect(screen.getByRole("form", { name: /add service form/i })).toBeInTheDocument();
  });
});

// ── Test 3: Edit form pre-fills and submits to updateServiceAction ─────────────
describe("[AC-DASH-010-02] edit form pre-fills and submits to updateServiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateServiceAction.mockResolvedValue({
      success: true,
      data: { ...ACTIVE_SERVICE, name: "Updated Name" },
    });
  });

  it("pre-fills the form with current service values", () => {
    render(<EditServiceForm service={ACTIVE_SERVICE} onSuccess={vi.fn()} onCancel={vi.fn()} />);

    // Name pre-filled
    const nameInput = screen.getByLabelText(/service name/i);
    expect(nameInput).toHaveValue("Individual Tax Return");

    // Description pre-filled
    const descInput = screen.getByLabelText(/description/i);
    expect(descInput).toHaveValue("1040 preparation");

    // Sort order pre-filled
    const sortInput = screen.getByLabelText(/sort order/i);
    expect(sortInput).toHaveValue(1);
  });

  it("pre-fills empty description when service description is null", () => {
    render(
      <EditServiceForm
        service={{ ...ACTIVE_SERVICE, description: null }}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const descInput = screen.getByLabelText(/description/i);
    expect(descInput).toHaveValue("");
  });

  it("submits updateServiceAction with edited values", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<EditServiceForm service={ACTIVE_SERVICE} onSuccess={onSuccess} onCancel={vi.fn()} />);

    // Edit the name
    const nameInput = screen.getByLabelText(/service name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Name");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdateServiceAction).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "svc-001",
          name: "Updated Name",
        })
      );
    });
  });

  it("calls onSuccess after successful submission", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<EditServiceForm service={ACTIVE_SERVICE} onSuccess={onSuccess} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  it("displays error message when updateServiceAction returns { success: false }", async () => {
    mockUpdateServiceAction.mockResolvedValue({
      success: false,
      error: "Service name must be 200 characters or fewer",
    });

    const user = userEvent.setup();
    render(<EditServiceForm service={ACTIVE_SERVICE} onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Service name must be 200 characters or fewer"
      );
    });
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<EditServiceForm service={ACTIVE_SERVICE} onSuccess={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(mockUpdateServiceAction).not.toHaveBeenCalled();
  });

  it("opens edit form pre-filled with service data when Edit is clicked on ServiceList", async () => {
    const user = userEvent.setup();
    render(<ServiceList services={[ACTIVE_SERVICE]} />);

    await user.click(screen.getByRole("button", { name: /edit individual tax return/i }));

    // Edit form appears with pre-filled data
    expect(screen.getByRole("form", { name: /edit service form/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Individual Tax Return")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1040 preparation")).toBeInTheDocument();
  });
});

// ── Test 4: Deactivate control invokes deactivateServiceAction ─────────────────
describe("[AC-DASH-010-03] deactivate control invokes deactivateServiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.confirm to return true (user confirms deactivation)
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDeactivateServiceAction.mockResolvedValue({
      success: true,
      data: { ...ACTIVE_SERVICE, active: false },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls deactivateServiceAction with the service id when Deactivate is clicked", async () => {
    const user = userEvent.setup();
    render(<ServiceList services={[ACTIVE_SERVICE]} />);

    await user.click(screen.getByRole("button", { name: /deactivate individual tax return/i }));

    await waitFor(() => {
      expect(mockDeactivateServiceAction).toHaveBeenCalledWith("svc-001");
    });
  });

  it("does NOT call deactivateServiceAction if user cancels the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const user = userEvent.setup();
    render(<ServiceList services={[ACTIVE_SERVICE]} />);

    await user.click(screen.getByRole("button", { name: /deactivate individual tax return/i }));

    await waitFor(() => {
      expect(mockDeactivateServiceAction).not.toHaveBeenCalled();
    });
  });

  it("shows error message when deactivateServiceAction returns { success: false }", async () => {
    mockDeactivateServiceAction.mockResolvedValue({
      success: false,
      error: "Unauthorized: ACCOUNTANT identity required",
    });

    const user = userEvent.setup();
    render(<ServiceList services={[ACTIVE_SERVICE]} />);

    await user.click(screen.getByRole("button", { name: /deactivate individual tax return/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Unauthorized: ACCOUNTANT identity required"
      );
    });
  });

  it("inactive services have no Deactivate button — reactivation is out of scope", () => {
    render(<ServiceList services={[INACTIVE_SERVICE]} />);

    // No deactivate button rendered for already-inactive service
    expect(
      screen.queryByRole("button", { name: /deactivate/i })
    ).not.toBeInTheDocument();
  });
});
