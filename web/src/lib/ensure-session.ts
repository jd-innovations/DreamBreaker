import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/with-timeout";

/**
 * Ensures the browser has a usable, non-expired auth session before a write.
 *
 * A stale access token still lets public reads through but makes RLS-guarded
 * writes silently match 0 rows (Supabase returns no error), so saves appear to
 * succeed but never persist. Calling this first force-refreshes the token when
 * it's missing/expired so the write carries valid credentials.
 *
 * Returns true if there's a usable session, false if the user needs to sign in
 * again (refresh token invalid/expired).
 */
export async function ensureFreshSession(): Promise<boolean> {
  const supabase = createClient();
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), 8000);
    const session = data.session;
    if (!session) return false;

    // Refresh if the access token is missing an expiry or expires within 2 min.
    const expiresAtMs = (session.expires_at ?? 0) * 1000;
    const needsRefresh = !session.expires_at || expiresAtMs - Date.now() < 120_000;
    if (needsRefresh) {
      const { data: refreshed, error } = await withTimeout(supabase.auth.refreshSession(), 8000);
      if (error || !refreshed.session) return false;
    }
    return true;
  } catch {
    return false;
  }
}
