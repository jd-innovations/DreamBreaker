import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// Public anon credentials — safe to ship in client bundles.
// Next.js replaces missing NEXT_PUBLIC_* vars with the string "undefined" at
// build time, so we check for that explicitly before using the fallback.
const env = (key: string, fallback: string) => {
  const v = process.env[key as keyof typeof process.env];
  return v && v !== "undefined" ? v : fallback;
};

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL", "https://fbzetvkbhneptvfruilw.supabase.co");
const SUPABASE_ANON_KEY = env(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo",
);

export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: "pkce" },
  });
}
