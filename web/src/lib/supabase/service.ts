import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/database.types";
import { getSupabaseUrl, getSupabaseServiceRoleKey } from "./env";

// Service-role client — bypasses RLS entirely. Server-side only; never import
// this from a client component.
//
// Configuration is validated in ./env.ts, which also rejects the anon key being
// supplied in the service-role slot. That mistake is otherwise invisible: it
// yields a client that runs every privileged operation as an anonymous user,
// dropping writes and returning empty reads without raising.

export function createServiceClient() {
  return createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false },
  });
}
