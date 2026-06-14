import { createClient } from "@/lib/supabase/client";

/** Returns the current authenticated user's ID, or null if not signed in. */
export async function getUserId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
