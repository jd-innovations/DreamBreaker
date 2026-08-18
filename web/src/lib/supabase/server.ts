import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getSupabaseUrl, getSupabaseAnonKey } from "./env";

// Request-scoped server client, acting as the signed-in user via the auth
// cookies. Still the anon key — RLS is what limits it.
//
// Configuration is validated in ./env.ts. There is no hardcoded fallback: a
// misconfigured environment raises here instead of returning a client whose
// every query fails for reasons nobody can see.

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {}
        },
      },
    },
  );
}
