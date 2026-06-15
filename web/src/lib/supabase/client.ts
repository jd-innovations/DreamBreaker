import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// Public anon credentials — safe to ship in client bundles.
// The Vercel env vars are misconfigured (NEXT_PUBLIC_SUPABASE_URL holds the
// anon key) and Next inlines missing vars as the string "undefined", so we
// validate the shape and fall back to the known-good public credentials.
const FALLBACK_URL = "https://fbzetvkbhneptvfruilw.supabase.co";
const FALLBACK_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo";

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_URL = rawUrl?.startsWith("http") ? rawUrl : FALLBACK_URL;
const SUPABASE_ANON_KEY = rawKey?.startsWith("eyJ") ? rawKey : FALLBACK_ANON_KEY;

export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: "pkce" },
  });
}
