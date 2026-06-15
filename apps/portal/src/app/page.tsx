/**
 * apps/portal/src/app/page.tsx — Root page (redirect to /services)
 *
 * REQ-DOOR-004: The public front door — services page is the primary entry point.
 * Anonymous access: no sign-in required.
 */

import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/services");
}
