import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http")
  ? process.env.NEXT_PUBLIC_SUPABASE_URL
  : "https://fbzetvkbhneptvfruilw.supabase.co";

export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}
