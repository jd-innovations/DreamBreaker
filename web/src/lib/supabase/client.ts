import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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

// Emailed auth links must NOT use PKCE.
//
// `resetPasswordForEmail` and `signUp` send a code challenge only when flowType
// is 'pkce' (auth-js: `if (this.flowType === 'pkce')`). The emailed link then
// carries a `?code=` redeemable solely with the verifier saved in the requesting
// browser's storage — routinely missing or stale by the time the link is opened:
// another PKCE flow in the same browser overwrites it, and a mail app's in-app
// WebView is a different storage context entirely. Confirmed in production
// 2026-08-26 — `/verify` succeeded, then `/token` returned "code challenge does
// not match previously saved code verifier", and the user saw a link that looked
// expired but was perfectly good.
//
// With implicit flow no challenge is sent, so GoTrue hands the tokens back in a
// URL fragment: self-contained, nothing to match against storage, works in any
// browser on any device. auth-js checks `_isImplicitGrantCallback` before
// `_isPKCECallback` and gates neither on flowType, so the ordinary client on
// /auth/reset picks the fragment up with no special handling.
//
// ⚠️ This deliberately does NOT use `createBrowserClient` from @supabase/ssr.
// That wrapper hardcodes `flowType: "pkce"` *after* spreading `options.auth`
// (createBrowserClient.js), so a passed-in flowType is silently discarded —
// note the adjacent keys use `options?.auth?.X ?? default` and this one does
// not. An earlier version of this function used it and produced a PKCE client
// while claiming to be implicit; the emailed links kept arriving with a `pkce_`
// token prefix and nothing changed. Plain supabase-js honours the option.
//
// No session is involved in requesting either link, so this client stores nothing:
// persistSession off keeps it from touching the cookie storage the real client
// owns, and detectSessionInUrl off keeps it from racing that client for the URL.
//
// Tradeoff, stated plainly: a fragment puts real tokens in the URL, where
// history and referrers can see them. PKCE does not. This is the standard
// Supabase implicit flow and is acceptable for a single-use recovery link. The
// stronger option is a `token_hash` email template — stateless AND no tokens in
// the URL — which /auth/reset already redeems via verifyOtp, so changing the
// template from a desktop later is a drop-in upgrade needing no code change.
//
// OAuth stays on PKCE: it works, it is stronger, and the server-side callback
// route depends on exchangeCodeForSession.
export function createEmailLinkClient() {
  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
