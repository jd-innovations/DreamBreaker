// Turning an emailed auth link into a session.
//
// Every link GoTrue sends arrives in one of four shapes, and the differences
// are not cosmetic — each fails differently, and three of them fail silently.
//
//   1. `#access_token=…`       Implicit. Self-contained: the tokens are right
//                              there, so it works in any browser on any device.
//   2. `?token_hash=…&type=…`  Stateless. Redeemed by verifyOtp. Also portable,
//                              and unlike (1) it puts no live tokens in the URL.
//   3. `?code=…`               PKCE. Redeemable ONLY in the browser that made
//                              the request — the verifier lives in that
//                              browser's storage. A mail app's in-app WebView is
//                              a different storage context, so this shape fails
//                              for a large share of real users.
//   4. `?error=…` / `#error=…` GoTrue rejected the token and said why.
//
// Shape 1 must be redeemed by hand rather than left to `detectSessionInUrl`.
// auth-js refuses to consume an implicit URL with a PKCE client —
// `_getSessionFromURL` throws "Not a valid PKCE flow url." on the flowType
// mismatch, before it validates anything — and @supabase/ssr hardcodes
// `flowType: 'pkce'`, so an ssr client cannot be anything else. `setSession`
// has no such gate, and persists through the same cookie storage the rest of
// the app reads. Diagnosed in production 2026-08-26.
//
// Shape 4 is why this reports GoTrue's own message. A page that gives one
// reason for every failure is telling the user something it does not know.

import type { SupabaseClient } from "@supabase/supabase-js";

export type RedeemResult =
  | { ok: true }
  | { ok: false; message: string; received: string };

export const DEFAULT_FAILURE =
  "This link is no longer valid. Email links can only be used once, and they expire after a while.";

type OtpType = "recovery" | "email" | "invite" | "magiclink" | "signup" | "email_change";

/**
 * What the link carried, by key name only.
 *
 * Never the values: an implicit fragment holds a live access token, and this
 * string is rendered on screen. Key names alone separate the cases that matter.
 */
export function describeLinkParams(): string {
  const keys = (qs: string) => Array.from(new URLSearchParams(qs).keys());
  const search = keys(window.location.search);
  const hash = keys(window.location.hash.replace(/^#/, ""));
  const parts: string[] = [];
  if (search.length) parts.push(`query: ${search.join(", ")}`);
  if (hash.length) parts.push(`fragment: ${hash.join(", ")}`);
  return parts.length ? parts.join(" · ") : "no parameters";
}

/** GoTrue puts errors in the query string on some paths and the fragment on
 *  others, so check both rather than assuming. */
function readLinkError(): string | null {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = search.get("error_code") ?? hash.get("error_code");
  const description = search.get("error_description") ?? hash.get("error_description");
  const error = search.get("error") ?? hash.get("error");
  if (!code && !description && !error) return null;
  // error_description is URL-encoded prose written for humans; prefer it.
  return description ? description.replace(/\+/g, " ") : (code ?? error ?? DEFAULT_FAILURE);
}

/**
 * Establishes a session from the current URL.
 *
 * Call this BEFORE anything else reads `window.location` — a successful
 * implicit redemption clears the fragment.
 *
 * @param defaultType which OTP type a bare `token_hash` should be redeemed as.
 */
export async function redeemSessionFromUrl(
  supabase: SupabaseClient,
  defaultType: OtpType = "recovery",
): Promise<RedeemResult> {
  const received = describeLinkParams();
  const fail = (message: string): RedeemResult => ({ ok: false, message, received });

  const linkError = readLinkError();
  if (linkError) return fail(linkError);

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);

  try {
    // Shape 1.
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) return fail(error.message);
      // Don't leave live tokens in the address bar or in history.
      window.history.replaceState(null, "", window.location.pathname);
      return { ok: true };
    }

    // Shape 2.
    const tokenHash = searchParams.get("token_hash");
    if (tokenHash) {
      const { error } = await supabase.auth.verifyOtp({
        type: (searchParams.get("type") as OtpType) ?? defaultType,
        token_hash: tokenHash,
      });
      if (error) return fail(error.message);
      return { ok: true };
    }

    // Shape 3, or a session that already exists. supabase-js handles `?code=`
    // on its own during client init, so by here it has either worked or not.
    const { data } = await supabase.auth.getSession();
    if (data.session) return { ok: true };

    return fail(DEFAULT_FAILURE);
  } catch (err: unknown) {
    return fail(err instanceof Error ? err.message : DEFAULT_FAILURE);
  }
}
