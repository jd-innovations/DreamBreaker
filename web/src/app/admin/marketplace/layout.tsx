// Server-side gate for the marketplace moderation screen — same shape as
// admin/notifications/layout.tsx. A non-admin gets a genuine 404; signed out
// goes to sign-in and comes back here.
//
// Not the data boundary: admin_list_listings, admin_remove_listing and
// admin_restore_listing each check is_admin() themselves.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminFrame } from "@/components/admin/admin-frame";

export default async function MarketplaceAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/admin/marketplace");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) notFound();

  // Inside the admin frame so the shared sidebar gives navigation from any
  // admin tool page; AdminFrame supplies <main>.
  return <AdminFrame>{children}</AdminFrame>;
}
