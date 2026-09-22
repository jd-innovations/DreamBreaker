// Server-side gate for the push-campaign admin screens (Phase 5 of
// PUSH_BROADCAST_IMPLEMENTATION_PLAN.md).
//
// A server layout, not a check in the pages: the pages are client components,
// so anything they decided would ship to the browser and the route would still
// resolve (see admin/email-preview/layout.tsx for the same reasoning). A
// non-admin gets a genuine 404 on all three routes.
//
// This is not the authorization boundary for the data — every RPC and edge
// function re-checks is_admin() itself, so a read would fail independently
// even if this gate were bypassed.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) notFound();

  return <>{children}</>;
}
