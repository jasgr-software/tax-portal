/**
 * apps/admin/src/app/page.tsx — Root page placeholder for Tax Portal (accountant-facing)
 *
 * ADR-010: apps/admin has NO public routes — every path requires an authenticated ACCOUNTANT.
 *
 * // DECISION (TASK-004-002): This stub page is intentionally minimal and clearly labelled
 * // as an auth-pending placeholder. The real dashboard (with auth + accountant role gate)
 * // lands in TASK-004-002/-003. The placeholder does NOT implement an open, role-free
 * // admin home — it is a documented stub that signals auth is not yet wired.
 *
 * This page is NOT publicly accessible in production — Clerk middleware (TASK-004-002) will
 * redirect unauthenticated visitors before this page is ever rendered in a real deploy.
 */

export default function AdminHomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tax Portal</h1>
        <p className="text-sm text-gray-500 mb-4">Accountant Dashboard</p>
        {/* AUTH STUB — TASK-004-002 will replace this with the Clerk-authenticated dashboard */}
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
          <p className="font-semibold mb-1">Auth stub — TASK-004-002 pending</p>
          <p>
            This page is a scaffold placeholder. Clerk authentication and accountant
            role-gate middleware will be wired in TASK-004-002 and TASK-004-003.
            No public route is intentionally exposed here (ADR-010).
          </p>
        </div>
      </div>
    </div>
  );
}
