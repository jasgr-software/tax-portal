/**
 * apps/portal/src/components/RequestForm.test.tsx
 *
 * Tier 2/5 component tests for RequestForm.
 *
 * AC-DOOR-004-05: Cannot submit with zero services selected — client-side guard.
 * AC-DOOR-003-02: The form has no freeform "describe your need" textarea replacing the checklist.
 * AC-DOOR-003-03: Selecting different services does NOT render service-specific sub-questions.
 * AC-DOOR-004-01: One or more services can be selected.
 * AC-DOOR-004-02: Basic contact fields present (firstName, lastName, email).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RequestForm } from "./RequestForm.js";
import type { ServiceListItem } from "@tax-portal/db";

// Mock the server action — it calls @tax-portal/db which needs a real DB connection.
// Tests focus on client-side behavior; the server action is tested separately.
vi.mock("@/app/(public)/request/actions", () => ({
  submitEngagementRequest: vi.fn().mockResolvedValue({
    success: true,
    requestId: "test-request-id-123",
  }),
}));

// Minimal active services fixture
const SERVICES: ServiceListItem[] = [
  { id: "svc-001", name: "Individual Tax Return", description: "1040 prep", sortOrder: 1 },
  { id: "svc-002", name: "Business Tax Return", description: "S-Corp/LLC", sortOrder: 2 },
];

describe("RequestForm [AC-DOOR-003-02][AC-DOOR-003-03][AC-DOOR-004-05]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── AC-DOOR-003-02 ──────────────────────────────────────────────────────────
  describe("AC-DOOR-003-02: No freeform 'describe your need' textarea", () => {
    it("does NOT render a textarea for freeform service description", () => {
      render(<RequestForm services={SERVICES} />);

      // There must be no textarea in the form
      expect(screen.queryByRole("textbox", { name: /describe/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: /need/i })).not.toBeInTheDocument();
      // General check: no textarea elements at all
      expect(document.querySelector("textarea")).not.toBeInTheDocument();
    });

    it("renders a checklist of services instead of a description field", () => {
      render(<RequestForm services={SERVICES} />);

      // Services appear as checkboxes
      expect(screen.getByLabelText("Individual Tax Return")).toBeInTheDocument();
      expect(screen.getByLabelText("Business Tax Return")).toBeInTheDocument();
    });
  });

  // ── AC-DOOR-003-03 ──────────────────────────────────────────────────────────
  describe("AC-DOOR-003-03: No service-specific sub-questions", () => {
    it("does NOT render additional sub-questions when a service is selected", () => {
      render(<RequestForm services={SERVICES} />);

      const initialCheckboxCount = screen.getAllByRole("checkbox").length;
      const initialInputCount = screen.getAllByRole("textbox").length;

      // Select a service
      fireEvent.click(screen.getByLabelText("Individual Tax Return"));

      // Checkbox count must not increase (no new sub-question checkboxes)
      expect(screen.getAllByRole("checkbox")).toHaveLength(initialCheckboxCount);
      // Textbox count must not increase (no new sub-question inputs)
      expect(screen.getAllByRole("textbox")).toHaveLength(initialInputCount);
    });

    it("does NOT render sub-questions when a different service is selected", () => {
      render(<RequestForm services={SERVICES} />);

      const initialCheckboxCount = screen.getAllByRole("checkbox").length;
      const initialInputCount = screen.getAllByRole("textbox").length;

      // Select the other service
      fireEvent.click(screen.getByLabelText("Business Tax Return"));

      // Still no new elements
      expect(screen.getAllByRole("checkbox")).toHaveLength(initialCheckboxCount);
      expect(screen.getAllByRole("textbox")).toHaveLength(initialInputCount);
    });

    it("does NOT render sub-questions when multiple services are selected", () => {
      render(<RequestForm services={SERVICES} />);

      const initialCheckboxCount = screen.getAllByRole("checkbox").length;
      const initialInputCount = screen.getAllByRole("textbox").length;

      // Select both services
      fireEvent.click(screen.getByLabelText("Individual Tax Return"));
      fireEvent.click(screen.getByLabelText("Business Tax Return"));

      // Still no new elements
      expect(screen.getAllByRole("checkbox")).toHaveLength(initialCheckboxCount);
      expect(screen.getAllByRole("textbox")).toHaveLength(initialInputCount);
    });
  });

  // ── AC-DOOR-004-05 ──────────────────────────────────────────────────────────
  describe("AC-DOOR-004-05: Cannot submit with zero services selected", () => {
    it("shows an error and does NOT call the action when zero services are selected", async () => {
      const { submitEngagementRequest } = await import(
        "@/app/(public)/request/actions"
      );
      render(<RequestForm services={SERVICES} />);

      // Fill in contact fields but leave services unchecked
      fireEvent.change(screen.getByLabelText(/first name/i), {
        target: { value: "Jane" },
      });
      fireEvent.change(screen.getByLabelText(/last name/i), {
        target: { value: "Smith" },
      });
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: "jane@example.com" },
      });

      // Submit with zero services selected
      // Note: <form> without aria-label doesn't have the ARIA "form" role by default;
      // use querySelector to get the form element directly.
      const form = document.querySelector("form");
      if (!form) throw new Error("Form element not found");
      fireEvent.submit(form);

      // Error message must appear
      await waitFor(() => {
        expect(
          screen.getByRole("alert"),
        ).toHaveTextContent(/please select at least one service/i);
      });

      // Server action must NOT have been called
      expect(submitEngagementRequest).not.toHaveBeenCalled();
    });

    it("allows submission after selecting a service following a zero-selection error", async () => {
      const { submitEngagementRequest } = await import(
        "@/app/(public)/request/actions"
      );
      render(<RequestForm services={SERVICES} />);

      // Submit with no services — triggers error
      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });

      // Fill contact fields
      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jane" } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Smith" } });
      fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "jane@example.com" } });

      // Now select a service and re-submit — action should be called
      fireEvent.click(screen.getByLabelText("Individual Tax Return"));
      expect(screen.getByLabelText("Individual Tax Return")).toBeChecked();
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(submitEngagementRequest).toHaveBeenCalled();
      });
    });

    it("allows submission when at least one service is selected", async () => {
      const { submitEngagementRequest } = await import(
        "@/app/(public)/request/actions"
      );
      render(<RequestForm services={SERVICES} />);

      // Select one service
      fireEvent.click(screen.getByLabelText("Individual Tax Return"));

      // Fill in contact fields
      fireEvent.change(screen.getByLabelText(/first name/i), {
        target: { value: "Jane" },
      });
      fireEvent.change(screen.getByLabelText(/last name/i), {
        target: { value: "Smith" },
      });
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: "jane@example.com" },
      });

      // Submit
      const form = document.querySelector("form");
      fireEvent.submit(form!);

      // Action should be called (eventually)
      await waitFor(() => {
        expect(submitEngagementRequest).toHaveBeenCalled();
      });
    });
  });

  // ── AC-DOOR-004-02 ──────────────────────────────────────────────────────────
  describe("AC-DOOR-004-02: Basic contact fields", () => {
    it("renders firstName, lastName, and email fields", () => {
      render(<RequestForm services={SERVICES} />);

      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    });
  });

  // ── Success state ────────────────────────────────────────────────────────────
  describe("Success state", () => {
    it("shows success message after successful submission", async () => {
      render(<RequestForm services={SERVICES} />);

      // Select a service and fill in contact
      fireEvent.click(screen.getByLabelText("Individual Tax Return"));
      fireEvent.change(screen.getByLabelText(/first name/i), {
        target: { value: "Jane" },
      });
      fireEvent.change(screen.getByLabelText(/last name/i), {
        target: { value: "Smith" },
      });
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: "jane@example.com" },
      });

      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(/request submitted/i);
      });
    });
  });
});
