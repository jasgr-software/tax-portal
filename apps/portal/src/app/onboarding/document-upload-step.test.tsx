/**
 * apps/portal/src/app/onboarding/document-upload-step.test.tsx
 *
 * Component tests for DocumentUploadStep (TASK-007-006).
 * All server actions and @tax-portal/db seams are mocked — no real DB, no real auth.
 *
 * Tests cover:
 *   [AC-ONBD-004-01] renders the document checklist items
 *   [AC-ONBD-004-02] outstanding vs. fulfilled items distinguished
 *   [AC-ONBD-004-03] upload widget per outstanding request
 *   [AC-ONBD-002-02 honored] document-upload locked when letter unsigned (accessible:false)
 *   [AC-FILE-002-01] no accept restriction on file input (any type)
 *   [AC-FILE-007-02] request labels rendered
 *   [AC-FILE-008-02] outstanding/fulfilled visually distinguished
 *   [AC-NFR-009-02] infected file shows rejection message + request stays outstanding
 *   [AC-ONBD-004-04] awaiting state when checklist is null
 *   [security] label content auto-escaped (no dangerouslySetInnerHTML)
 *
 * Methodology: test-after, AC tags in titles.
 * E2e is TASK-007-006 e2e specs — no e2e here.
 *
 * GUARDRAIL: tests assert the UI REFLECTS the server-returned data — they do not assert
 * that the UI computes its own gate. The gate is the server's OnboardingReadModel.
 *
 * ADR-006: portal-only component tests — never imported in apps/admin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ChecklistReadModel } from "@tax-portal/db";

// ─── Hoisted mock factories ───────────────────────────────────────────────────

const {
  mockRequestUploadUrlAction,
  mockCompleteUploadAction,
  mockGetChecklistAction,
} = vi.hoisted(() => ({
  mockRequestUploadUrlAction: vi.fn(),
  mockCompleteUploadAction: vi.fn(),
  mockGetChecklistAction: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock the server actions at the component boundary.
vi.mock("./actions", () => ({
  requestUploadUrlAction: mockRequestUploadUrlAction,
  completeUploadAction: mockCompleteUploadAction,
  getChecklistAction: mockGetChecklistAction,
  signEngagementLetterAction: vi.fn(),
  getMyOnboardingAction: vi.fn(),
  getClientIdentity: vi.fn(),
  getMyQuestionnaireAction: vi.fn(),
  submitQuestionnaireAction: vi.fn(),
}));

// Mock @tax-portal/db — prevent DB module loading in jsdom.
vi.mock("@tax-portal/db", () => ({
  resolveOnboarding: vi.fn(),
  checkStepAccessibility: vi.fn(),
  resolveChecklist: vi.fn(),
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import { DocumentUploadStep } from "./_components/DocumentUploadStep";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENGAGEMENT_ID = "engagement-uuid-upload-test-001";

const CHECKLIST_WITH_OUTSTANDING: ChecklistReadModel = {
  engagementId: ENGAGEMENT_ID,
  items: [
    { requestId: "req-001", label: "Tax Return W-2", status: "outstanding" },
    { requestId: "req-002", label: "Schedule C", status: "outstanding" },
  ],
  allRequiredProvided: false,
};

const CHECKLIST_WITH_FULFILLED: ChecklistReadModel = {
  engagementId: ENGAGEMENT_ID,
  items: [
    { requestId: "req-001", label: "Tax Return W-2", status: "fulfilled" },
    { requestId: "req-002", label: "Schedule C", status: "outstanding" },
  ],
  allRequiredProvided: false,
};

const CHECKLIST_ALL_PROVIDED: ChecklistReadModel = {
  engagementId: ENGAGEMENT_ID,
  items: [
    { requestId: "req-001", label: "Tax Return W-2", status: "fulfilled" },
    { requestId: "req-002", label: "Schedule C", status: "fulfilled" },
  ],
  allRequiredProvided: true,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: request URL succeeds
  mockRequestUploadUrlAction.mockResolvedValue({
    success: true,
    data: {
      documentId: "doc-uuid-001",
      uploadUrl: "https://storage.example.com/upload-url?sig=test",
      storageKey: `engagements/${ENGAGEMENT_ID}/documents/doc-uuid-001/v1/test.pdf`,
    },
  });

  // Default: complete upload → active
  mockCompleteUploadAction.mockResolvedValue({
    success: true,
    data: { outcome: "active", documentId: "doc-uuid-001" },
  });

  // Default: checklist refresh succeeds
  mockGetChecklistAction.mockResolvedValue({
    success: true,
    data: CHECKLIST_ALL_PROVIDED,
  });

  // Mock global fetch (storage PUT)
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
  });
});

// ─── DocumentUploadStep — EPIC-005 gate honored: locked state ─────────────────

describe("DocumentUploadStep — [AC-ONBD-002-02 honored] locked when accessible:false", () => {

  it("[AC-ONBD-002-02 honored] renders locked affordance when accessible=false", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: false, done: false }}
        checklist={null}
      />,
    );

    expect(screen.getByTestId("document-upload-locked")).toBeInTheDocument();
  });

  it("[AC-ONBD-002-02 honored] does NOT render upload widget when step not accessible", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: false, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    expect(screen.queryByTestId("document-upload-active")).not.toBeInTheDocument();
    expect(screen.queryByTestId("checklist-items")).not.toBeInTheDocument();
  });

  it("[AC-ONBD-002-02 honored] locked state shows letter-signing instruction", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: false, done: false }}
        checklist={null}
      />,
    );

    const locked = screen.getByTestId("document-upload-locked");
    expect(locked).toHaveTextContent(/sign the engagement letter/i);
  });

  it("[security] gate NOT weakened: accessible=false + checklist present still shows locked", () => {
    // Even if checklist data is provided while inaccessible, the component
    // must honour accessible:false and show locked, never the upload interface.
    render(
      <DocumentUploadStep
        stepState={{ accessible: false, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    expect(screen.getByTestId("document-upload-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("document-upload-active")).not.toBeInTheDocument();
  });

});

// ─── DocumentUploadStep — awaiting state (checklist null) ─────────────────────

describe("DocumentUploadStep — [AC-ONBD-004-04] awaiting state when no requests authored", () => {

  it("[AC-ONBD-004-04] renders awaiting state when checklist is null", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={null}
      />,
    );

    expect(screen.getByTestId("document-upload-awaiting")).toBeInTheDocument();
  });

  it("[AC-ONBD-004-04] awaiting state shows no upload widgets", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={null}
      />,
    );

    expect(screen.queryByTestId("checklist-items")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

});

// ─── DocumentUploadStep — checklist renders (AC-ONBD-004-01, AC-FILE-007-02) ─────

describe("DocumentUploadStep — [AC-ONBD-004-01] checklist items rendered", () => {

  it("[AC-ONBD-004-01] renders all checklist items from the read model", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    expect(screen.getByTestId("checklist-item-req-001")).toBeInTheDocument();
    expect(screen.getByTestId("checklist-item-req-002")).toBeInTheDocument();
  });

  it("[AC-FILE-007-02] request label rendered as text for each item", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    expect(screen.getByTestId("checklist-label-req-001")).toHaveTextContent("Tax Return W-2");
    expect(screen.getByTestId("checklist-label-req-002")).toHaveTextContent("Schedule C");
  });

  it("[AC-ONBD-004-01] checklist item has data-request-id attribute", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    expect(screen.getByTestId("checklist-item-req-001")).toHaveAttribute("data-request-id", "req-001");
    expect(screen.getByTestId("checklist-item-req-002")).toHaveAttribute("data-request-id", "req-002");
  });

  it("[AC-ONBD-004-01] upload-active container has data-step='document-upload'", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    const active = screen.getByTestId("document-upload-active");
    expect(active).toHaveAttribute("data-step", "document-upload");
  });

});

// ─── DocumentUploadStep — outstanding vs. fulfilled (AC-ONBD-004-02, AC-FILE-008-02) ──

describe("DocumentUploadStep — [AC-ONBD-004-02] outstanding vs. fulfilled distinguished", () => {

  it("[AC-FILE-008-02] outstanding item shows 'Outstanding' status badge", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    expect(screen.getByTestId("checklist-status-req-001")).toHaveTextContent("Outstanding");
  });

  it("[AC-FILE-008-02] fulfilled item shows 'Provided' status badge", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_FULFILLED}
      />,
    );

    expect(screen.getByTestId("checklist-status-req-001")).toHaveTextContent("Provided");
  });

  it("[AC-ONBD-004-02] outstanding item has data-status='outstanding'", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    expect(screen.getByTestId("checklist-item-req-001")).toHaveAttribute("data-status", "outstanding");
  });

  it("[AC-ONBD-004-02] fulfilled item has data-status='fulfilled'", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_FULFILLED}
      />,
    );

    expect(screen.getByTestId("checklist-item-req-001")).toHaveAttribute("data-status", "fulfilled");
  });

  it("[AC-FILE-008-03] fulfilled item does NOT show the upload widget", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_FULFILLED}
      />,
    );

    // req-001 is fulfilled → no file input for it
    expect(screen.queryByTestId("file-input-req-001")).not.toBeInTheDocument();
  });

  it("[AC-ONBD-004-03] outstanding item shows the upload widget", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    expect(screen.getByTestId("file-input-req-001")).toBeInTheDocument();
    expect(screen.getByTestId("file-input-req-002")).toBeInTheDocument();
  });

});

// ─── DocumentUploadStep — AC-FILE-002-01: no accept restriction ───────────────

describe("DocumentUploadStep — [AC-FILE-002-01] no file-type accept restriction", () => {

  it("[AC-FILE-002-01] file input has NO accept attribute (any file type accepted)", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    const fileInput = screen.getByTestId("file-input-req-001") as HTMLInputElement;
    // AC-FILE-002-01: no format allow-list → no accept attribute restriction
    expect(fileInput.accept).toBeFalsy();
    expect(fileInput).not.toHaveAttribute("accept");
  });

});

// ─── DocumentUploadStep — satisfied state (done:true) ─────────────────────────

describe("DocumentUploadStep — satisfied state when done:true", () => {

  it("renders satisfied state when done=true and checklist has items", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: true }}
        checklist={CHECKLIST_ALL_PROVIDED}
      />,
    );

    expect(screen.getByTestId("document-upload-satisfied")).toBeInTheDocument();
    expect(screen.getByTestId("document-upload-done-confirmation")).toBeInTheDocument();
  });

  it("satisfied state does NOT show upload widgets", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: true }}
        checklist={CHECKLIST_ALL_PROVIDED}
      />,
    );

    expect(screen.queryByTestId("file-input-req-001")).not.toBeInTheDocument();
    expect(screen.queryByTestId("file-input-req-002")).not.toBeInTheDocument();
  });

  it("satisfied state renders the checklist items as read-only", () => {
    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: true }}
        checklist={CHECKLIST_ALL_PROVIDED}
      />,
    );

    expect(screen.getByTestId("checklist-items")).toBeInTheDocument();
    expect(screen.getByTestId("checklist-item-req-001")).toBeInTheDocument();
    expect(screen.getByTestId("checklist-item-req-002")).toBeInTheDocument();
  });

});

// ─── DocumentUploadStep — AC-NFR-009-02: infected file rejection surface ───────

describe("DocumentUploadStep — [AC-NFR-009-02] infected file → rejection message", () => {

  it("[AC-NFR-009-02] shows rejection message when outcome=infected", async () => {
    // Override: complete upload returns infected outcome
    mockCompleteUploadAction.mockResolvedValue({
      success: true,
      data: { outcome: "infected", documentId: "doc-uuid-001" },
    });

    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    // Find the file input for req-001 and trigger a file upload
    const fileInput = screen.getByTestId("file-input-req-001");
    const testFile = new File(["eicar-test-content"], "eicar.txt", {
      type: "text/plain",
    });

    fireEvent.change(fileInput, { target: { files: [testFile] } });

    // Wait for the async upload pipeline to complete
    await waitFor(() => {
      expect(screen.getByTestId("upload-rejected-req-001")).toBeInTheDocument();
    });
  });

  it("[AC-NFR-009-02] rejection message contains malicious-content language", async () => {
    mockCompleteUploadAction.mockResolvedValue({
      success: true,
      data: { outcome: "infected", documentId: "doc-uuid-001" },
    });

    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    const fileInput = screen.getByTestId("file-input-req-001");
    const testFile = new File(["eicar"], "bad.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    await waitFor(() => {
      const rejection = screen.getByTestId("upload-rejected-req-001");
      expect(rejection).toHaveTextContent(/malicious/i);
    });
  });

  it("[AC-NFR-009-02] infected outcome has role=alert", async () => {
    mockCompleteUploadAction.mockResolvedValue({
      success: true,
      data: { outcome: "infected", documentId: "doc-uuid-001" },
    });

    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    const fileInput = screen.getByTestId("file-input-req-001");
    const testFile = new File(["x"], "evil.exe", { type: "application/x-msdownload" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    await waitFor(() => {
      const rejection = screen.getByTestId("upload-rejected-req-001");
      expect(rejection).toHaveAttribute("role", "alert");
    });
  });

  it("[AC-FILE-008-03] infected upload — request stays outstanding (file not active)", async () => {
    mockCompleteUploadAction.mockResolvedValue({
      success: true,
      data: { outcome: "infected", documentId: "doc-uuid-001" },
    });

    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={CHECKLIST_WITH_OUTSTANDING}
      />,
    );

    const fileInput = screen.getByTestId("file-input-req-001");
    const testFile = new File(["x"], "bad.exe", { type: "application/x-msdownload" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    await waitFor(() => {
      expect(screen.getByTestId("upload-rejected-req-001")).toBeInTheDocument();
    });

    // req-001 should still be outstanding (not fulfilled), and upload widget still present
    expect(screen.queryByTestId("file-input-req-001")).toBeInTheDocument();
  });

});

// ─── Security: label content auto-escaped ─────────────────────────────────────

describe("DocumentUploadStep — [security] request label content auto-escaped", () => {

  it("[security] request label rendered as text — no HTML injection possible", () => {
    const maliciousChecklist: ChecklistReadModel = {
      engagementId: ENGAGEMENT_ID,
      items: [
        {
          requestId: "req-xss",
          label: "<script>alert('xss')</script>",
          status: "outstanding",
        },
      ],
      allRequiredProvided: false,
    };

    render(
      <DocumentUploadStep
        stepState={{ accessible: true, done: false }}
        checklist={maliciousChecklist}
      />,
    );

    // Should appear as escaped text, not as a script element.
    expect(screen.getByTestId("checklist-label-req-xss")).toHaveTextContent(
      "<script>alert('xss')</script>",
    );
    // No actual <script> element was injected.
    expect(document.querySelector("script[data-testid]")).toBeNull();
  });

});
