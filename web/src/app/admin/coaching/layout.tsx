// Server-side gate for coach-offer moderation — same shape as
// admin/marketplace/layout.tsx. A non-admin gets a genuine 404; signed out goes
// to sign-in and comes back here.
//
// Not the data boundary: admin_list_coach_offers, admin_remove_coach_offer and
// admin_restore_coach_offer each check is_admin() themselves.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";

export default async function CoachingAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/admin/coaching");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) notFound();

  return <PageShell hideFooter>{children}</PageShell>;
}
