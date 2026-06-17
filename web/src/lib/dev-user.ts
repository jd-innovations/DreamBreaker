import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/with-timeout";

/**
 * Returns the current authenticated user's ID, or null if not signed in.
 *
 * Guarded with a timeout: a stale/corrupt session can make the Supabase auth
 * token refresh hang indefinitely, which would otherwise leave pages stuck on
 * a loading spinner. On timeout we treat the user as signed-out so the page
 * can recover (e.g. redirect to /auth) instead of hanging forever.
 */
export async function getUserId(): Promise<string | null> {
  const supabase = createClient();
  try {
    const { data } = await withTimeout(supabase.auth.getUser(), 8000);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
