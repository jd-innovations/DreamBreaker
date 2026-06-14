import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

function getConfig() {
  // Try build-time env var first (works locally and when cache is fresh)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) return { url, key };

  // Fall back to runtime config injected by the server layout
  if (typeof document !== "undefined") {
    const el = document.getElementById("app-config");
    if (el) {
      const cfg = JSON.parse(el.textContent ?? "{}");
      if (cfg.supabaseUrl && cfg.supabaseAnonKey) return { url: cfg.supabaseUrl, key: cfg.supabaseAnonKey };
    }
  }

  throw new Error("Supabase config not found — check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.");
}

export function createClient() {
  const { url, key } = getConfig();
  return createBrowserClient<Database>(url, key, {
    auth: { flowType: "pkce" },
  });
}
