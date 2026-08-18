import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getSupabaseUrl, getSupabaseAnonKey } from "./env";

// Browser client. The anon credentials it carries are public by design — access
// is controlled by RLS, not by keeping the key secret.
//
// Configuration is validated in ./env.ts. There is no hardcoded fallback: a
// build with missing or malformed Supabase variables fails at the first call
// here rather than silently connecting to the production project.

export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { flowType: "pkce" },
  });
}
