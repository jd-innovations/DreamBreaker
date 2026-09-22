// The directory is signed-in only, like the app's: search_players and the map
// RPCs return nothing to anon, and a people directory is not a public page.
// Signed out → sign in, then back here.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Players — Pickleball App" };

export default async function PlayersLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/players");
  return <>{children}</>;
}
