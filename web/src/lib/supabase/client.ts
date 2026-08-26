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

// Password recovery must NOT use PKCE.
//
// `resetPasswordForEmail` sends a code challenge only when the client's flowType
// is 'pkce' (auth-js GoTrueClient: `if (this.flowType === 'pkce')`). The emailed
// link then carries a `?code=` redeemable only with the verifier saved in the
// requesting browser's storage — and that verifier is routinely missing or stale
// by the time the link is opened: another PKCE flow in the same browser
// overwrites it, and a mail app's in-app WebView is a different storage context
// entirely. Confirmed in production 2026-08-26 — `/verify` succeeded, then
// `/token` returned "code challenge does not match previously saved code
// verifier", and the user saw a link that looked expired but was perfectly good.
//
// With implicit flow no challenge is sent, so GoTrue hands the tokens back in a
// URL fragment. That is self-contained: no stored verifier, so it works in any
// browser on any device. auth-js checks `_isImplicitGrantCallback` before
// `_isPKCECallback` and gates neither on the configured flowType, so the normal
// PKCE client on /auth/reset picks the fragment up with no special handling.
//
// Tradeoff, stated plainly: a fragment puts real tokens in the URL, where
// history and referrers can see them, whereas PKCE does not. That is the
// standard Supabase implicit flow and is acceptable for a single-use recovery
// link. The stronger option is a `token_hash` link (stateless AND no tokens in
// the URL), which needs an email-template change in the dashboard —
// /auth/reset already redeems that shape via verifyOtp, so switching the
// template later is a drop-in upgrade that requires no code change.
//
// OAuth stays on PKCE: it works, it is more secure, and the server-side callback
// route depends on exchangeCodeForSession.
export function createRecoveryClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { flowType: "implicit" },
  });
}
