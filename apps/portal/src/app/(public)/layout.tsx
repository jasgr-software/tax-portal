/**
 * apps/portal/src/app/(public)/layout.tsx — Public route group layout
 *
 * REQ-DOOR-004 / ADR-003: All routes under (public) are anonymous — no Clerk auth gate.
 * The route group parentheses prevent "(public)" from appearing in URLs.
 *
 * This layout is intentionally minimal: it inherits the root layout and adds
 * no auth wiring. Clerk integration is deferred to EPIC-004.
 */

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
