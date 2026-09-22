// Gate for the admin email-preview tool.
//
// This route answered 200 to an unauthenticated request in production
// (verified 2026-08-27) and had no guard of any kind. That is TODO 1.1 item H8,
// "hide dev/test routes and admin-only tools". It was first closed with the
// internal-only `devTools` flag, which also hid it from admins in production;
// owner-approved 2026-09-22, it is now admin-only instead — the same gate as
// admin/notifications and admin/marketplace.
//
// A server layout rather than a check inside the page: `page.tsx` is a client
// component, so anything it decided would ship to the browser and the route
// would still resolve. `notFound()` here means the route genuinely 404s for a
// non-admin — "unreachable by direct URL, not merely unlinked".
//
// Not the data boundary: a preview is a dryRun of send-transactional-email,
// which never sends, and whose email gate admits only admins (or the dispatch
// secret / service key) once it is enforced.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";

export default async function EmailPreviewLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/admin/email-preview");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) notFound();

  // Inside the site shell (footer hidden) like every admin tool page. The page's
  // full-height split view is sized to the space below the 4rem header.
  return <PageShell hideFooter>{children}</PageShell>;
}
