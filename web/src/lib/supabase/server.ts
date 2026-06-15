import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

// Mirror client.ts: Next replaces missing NEXT_PUBLIC_* vars with the string
// "undefined" at build time, so fall back to the public anon credentials when
// the env vars aren't set. Without this, server-side queries silently fail.
const env = (key: string, fallback: string) => {
  const v = process.env[key as keyof typeof process.env];
  return v && v !== "undefined" ? v : fallback;
};

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL", "https://fbzetvkbhneptvfruilw.supabase.co");
const SUPABASE_ANON_KEY = env(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo",
);

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
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
