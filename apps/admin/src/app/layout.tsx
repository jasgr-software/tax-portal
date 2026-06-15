/**
 * apps/admin/src/app/layout.tsx — Root layout for the Tax Portal (accountant-facing)
 *
 * ADR-006: apps/admin is the accountant-facing frontend (port 3001).
 * ADR-010: apps/admin has NO public routes. Every path requires ACCOUNTANT auth.
 *
 * // DECISION (TASK-004-002): Auth middleware + role gate will be wired here once
 * // packages/auth lands. This layout is a stub pending TASK-004-002/-003.
 * // The home page renders a clearly-labelled "auth stub" to satisfy ADR-010's
 * // intent — no open, role-free admin surface is shipped. The actual authenticated
 * // layout (with Clerk provider, user context, nav links) lands in TASK-004-002.
 *
 * Tailwind CSS is loaded globally here via globals.css.
 */

import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tax Portal — Accountant Dashboard",
    template: "%s | Tax Portal",
  },
  description:
    "Internal accountant portal for managing client engagements, documents, and communications.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        {/*
         * TODO (TASK-004-002): Replace this stub layout with the authenticated
         * Clerk provider + accountant nav once packages/auth is wired up.
         * ADR-010: All routes in apps/admin require ACCOUNTANT auth.
         */}
        <main>{children}</main>
      </body>
    </html>
  );
}
