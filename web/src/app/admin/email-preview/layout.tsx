// Gate for the admin email-preview tool.
//
// This route answered 200 to an unauthenticated request in production
// (verified 2026-08-27) and had no guard of any kind. It is an internal tool —
// it renders any transactional template through the real sending path — and it
// has no business being publicly reachable. That is TODO 1.1 item H8, "hide
// dev/test routes and admin-only tools".
//
// A server layout rather than a check inside the page: `page.tsx` is a client
// component, so anything it decided would ship to the browser and the route
// would still resolve. `notFound()` here means the route genuinely 404s, which
// is the alignment plan's B4 verification criterion — "unreachable by direct
// URL, not merely unlinked".
//
// The sibling routes under /api/dev already do this properly with a hard 404
// plus a secret header; this brings the page routes in line with them.

import { notFound } from "next/navigation";
import { isFeatureEnabled } from "@/lib/features";

export default function EmailPreviewLayout({ children }: { children: React.ReactNode }) {
  if (!isFeatureEnabled("devTools")) notFound();
  return <>{children}</>;
}
