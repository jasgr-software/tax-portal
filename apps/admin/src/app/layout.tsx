/**
 * apps/admin/src/app/layout.tsx — Root layout for the Tax Portal (accountant-facing)
 *
 * ADR-006: apps/admin is the accountant-facing frontend (port 3001).
 * ADR-010: apps/admin has NO public routes. Every path requires ACCOUNTANT auth.
 *
 * EPIC-016 / TASK-016-006: AccountantNotificationBadgeServer mounted in nav.
 *   AC-MSG-017-01: badge visible from any area — persistent in the admin navigation shell.
 *   CS-TS-004: badge server component resolves ACCOUNTANT identity from cookie.
 *   ADR-003: initial count fetched under ACCOUNTANT SESSION_CONTEXT.
 *   DECISION-016-006-A: badge returns null for non-ACCOUNTANT sessions (defense-in-depth).
 *
 * Tailwind CSS is loaded globally here via globals.css.
 *
 * TASK-009-002: AdminDevBanner (dev-only role/user switcher + sign-out) is injected here.
 *   CS-TS-003: present on BOTH apps/admin (here) and apps/portal (mirrored).
 *   ADR-001: banner is inert under AUTH_PROVIDER=clerk — zero production impact.
 */

import type { Metadata } from "next";
import "@/styles/globals.css";
import { AdminDevBanner } from "@/app/(dev)/_components/DevBanner";
import { AccountantNotificationBadgeServer } from "@/app/notifications/AccountantNotificationBadgeServer";

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
         * Admin shell navigation — visible from every page (AC-MSG-017-01).
         * AccountantNotificationBadgeServer gates the badge on ACCOUNTANT identity:
         *   - Authenticated ACCOUNTANT → badge + unread count (server-fetched).
         *   - Guest / CLIENT → null (badge absent — defense-in-depth; ADR-010 middleware is primary gate).
         * DECISION-016-006-A: badge is ACCOUNTANT-only on apps/admin.
         * CS-TS-004: identity resolved from cookie inside AccountantNotificationBadgeServer.
         * ADR-010: Admin surface — only ACCOUNTANTs reach this layout.
         */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center justify-between">
              <div className="flex items-center gap-6">
                <span className="text-base font-bold text-gray-900">Tax Portal</span>
                <nav className="flex gap-4 text-sm" aria-label="Main navigation" data-testid="admin-nav">
                  <a href="/" className="text-gray-500 hover:text-gray-900 transition-colors">
                    Dashboard
                  </a>
                  <a href="/requests" className="text-gray-500 hover:text-gray-900 transition-colors">
                    Requests
                  </a>
                  <a href="/engagements" className="text-gray-500 hover:text-gray-900 transition-colors">
                    Engagements
                  </a>
                  <a href="/services" className="text-gray-500 hover:text-gray-900 transition-colors">
                    Services
                  </a>
                </nav>
              </div>
              {/*
               * Persistent notification badge — AC-MSG-017-01: visible from any area.
               * AccountantNotificationBadgeServer: server component that fetches initial
               * unread count and renders AccountantNotificationBadgeClient for live updates.
               * CS-TS-004: identity guard inside AccountantNotificationBadgeServer. // CS-TS-004
               * AC-MSG-013-03: document_uploaded notifications counted in the badge.
               */}
              <div className="flex items-center gap-3">
                <a
                  href="/requests"
                  className="relative flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600 font-medium"
                  data-testid="nav-notifications-link"
                >
                  Notifications
                  {/* AC-MSG-017-01: badge in nav — CS-TS-004 guard inside server component. */}
                  <AccountantNotificationBadgeServer />
                </a>
              </div>
            </div>
          </div>
        </header>
        <main>{children}</main>
        {/*
         * Dev-only role/user switcher + sign-out banner (TASK-009-002).
         * ADR-001: AdminDevBanner.isMockActive() guard — null under AUTH_PROVIDER=clerk.
         * CS-TS-003: also wired in apps/portal/src/app/layout.tsx.
         */}
        <AdminDevBanner />
      </body>
    </html>
  );
}
