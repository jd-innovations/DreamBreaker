import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/database.types";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/supabase/env";

// A plain, cookie-free anon client for public metadata reads (generateMetadata
// and the OG image route). Deliberately NOT the cookie-bound server client
// from @/lib/supabase/server: a crawler never carries a visitor's session, so
// every OG read is effectively anonymous anyway, and a plain client keeps this
// module usable from the image route's runtime without a request context.
//
// Still just the anon key, same as everywhere else on web — RLS (and, for
// `profiles`, the anon column-grant allowlist from
// 20260825120000_restrict_anon_profile_columns.sql) is what scopes what a
// crawler can see. Never the service-role key: that would bypass the RLS
// policies this whole module relies on to keep cancelled/private/draft rows
// out of a public preview.
let cached: ReturnType<typeof createClient<Database>> | null = null;

export function ogClient() {
  if (!cached) {
    cached = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: { persistSession: false },
    });
  }
  return cached;
}
