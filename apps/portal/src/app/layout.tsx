/**
 * apps/portal/src/app/layout.tsx — Root layout for the Client Portal
 *
 * ADR-006: apps/portal is the client-facing frontend (port 3000).
 * REQ-DOOR-004 / ADR-003: No auth gate here — public routes are anonymous.
 *               Clerk auth wiring is deferred to EPIC-004.
 *
 * Tailwind CSS is loaded globally here via globals.css.
 */

import type { Metadata } from "next";
import "@/styles/globals.css";

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
            <nav>
              <a
                href="/services"
                className="text-sm text-gray-600 hover:text-blue-600 font-medium"
              >
                Services
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
      </body>
    </html>
  );
}
