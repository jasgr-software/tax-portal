/**
 * apps/portal/src/app/layout.tsx — Root layout for the Client Portal
 *
 * ADR-006: apps/portal is the client-facing frontend (port 3000).
 * REQ-DOOR-004 / ADR-003: No auth gate here — public routes are anonymous.
 *               Clerk auth wiring is deferred to EPIC-004.
 *
 * Tailwind CSS is loaded globally here via globals.css.
 *
 * TASK-009-002: DevBanner (dev-only role/user switcher + sign-out) is injected here.
 *   CS-TS-003: present on BOTH apps/portal (here) and apps/admin (mirrored).
 *   ADR-001: banner is inert under AUTH_PROVIDER=clerk — zero production impact.
 *
 * EPIC-016 / TASK-016-005: NotificationBadgeServer mounted in nav.
 *   AC-MSG-017-01: badge visible from any area — persistent in the navigation shell.
 *   CS-TS-004: badge server component resolves CLIENT identity from cookie.
 *   ADR-003: initial count fetched under CLIENT SESSION_CONTEXT.
 *   DECISION-016-005-D: badge returns null for non-CLIENT sessions (guests, ACCOUNTANT).
 */

import type { Metadata } from "next";
import "@/styles/globals.css";
import { DevBanner } from "@/app/(dev)/_components/DevBanner";
import { NotificationBadgeServer } from "@/app/notifications/_components/NotificationBadgeServer";

export const metadata: Metadata = {
  title: {
    default: "Tax Accountant Client Portal",
    template: "%s | Tax Accountant Portal",
  },
  description:
    "Secure client portal for tax accounting services. Submit engagement requests, exchange documents, and track your tax engagement.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <a
              href="/"
              className="text-lg font-semibold text-gray-900 hover:text-blue-600"
            >
              Tax Accountant Portal
            </a>
            {/*
             * Navigation shell — visible from every page (AC-MSG-017-01).
             * NotificationBadgeServer gates the badge on CLIENT identity:
             *   - Authenticated CLIENT → badge + unread count (server-fetched).
             *   - Guest / ACCOUNTANT → null (badge absent).
             * DECISION-016-005-D: badge is CLIENT-only on apps/portal.
             * CS-TS-004: identity resolved from cookie inside NotificationBadgeServer.
             */}
            <nav
              className="flex items-center gap-4"
              data-testid="portal-nav"
            >
              <a
                href="/services"
                className="text-sm text-gray-600 hover:text-blue-600 font-medium"
              >
                Services
              </a>
              {/*
               * Notifications nav link + badge.
               * AC-MSG-017-01: badge persistent in nav — visible from any area.
               * The link text is "Notifications"; NotificationBadgeServer renders the count badge.
               * ADR-003: badge count fetched server-side under CLIENT SESSION_CONTEXT.
               */}
              <a
                href="/notifications"
                className="relative flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600 font-medium"
                data-testid="nav-notifications-link"
              >
                Notifications
                {/* CS-TS-004: identity guard inside NotificationBadgeServer. */}
                <NotificationBadgeServer />
              </a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-16 border-t border-gray-200 py-8">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Tax Accountant Portal. All rights
            reserved.
          </div>
        </footer>
        {/*
         * Dev-only role/user switcher + sign-out banner (TASK-009-002).
         * ADR-001: DevBanner.isMockActive() guard — null under AUTH_PROVIDER=clerk.
         * CS-TS-003: also wired in apps/admin/src/app/layout.tsx.
         */}
        <DevBanner />
      </body>
    </html>
  );
}
