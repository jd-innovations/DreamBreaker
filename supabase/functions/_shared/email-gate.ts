// Caller gate for send-transactional-email — closes an open email relay found
// 2026-09-22 (see EMAIL_RELAY_REMEDIATION.md).
//
// send-transactional-email accepts `to`, `subject` and raw `html`. Its only
// protection was verify_jwt, and the JWT every non-admin caller presented was
// the public anon key — which ships in the mobile app and the website. So
// anyone could mail anyone, from our domain, through our Resend account. This
// is the email twin of the push relay Phase 0 of PUSH_BROADCAST closed.
//
// ── Who may call ────────────────────────────────────────────────────────────
//
//   dispatch  the database (fn_send_transactional_email), proving itself with
//             the Vault dispatch secret — the SAME secret and validator the
//             push functions use (_shared/dispatch-gate.ts). One internal
//             dispatch secret, one place to rotate it.
//   service   server code holding the service-role key: cancel-registration,
//             waitlist-sweeper, the web Stripe webhook route. Compared with
//             this function's own SUPABASE_SERVICE_ROLE_KEY — exact match,
//             never a decoded claim, so it does not depend on the gateway's
//             verify_jwt having checked the signature.
//   admin     a signed-in admin (the admin Communications composer, review
//             invitations, the email preview). The user token is verified by
//             auth.getUser and is_admin() is asked AS that user.
//
// Everything else — the anon key, a non-admin user, nothing — is refused.
//
// ── Modes ───────────────────────────────────────────────────────────────────
//
//   "log"      every verdict is logged with the caller KIND, nothing refused.
//              Ships first, so no real email stops while the callers are
//              switched over and their verdicts are watched.
//   "enforce"  anything but dispatch/service/admin → 401, no detail.
//
// Flip to "enforce" only once the logs show every real caller path as one of
// the three allowed kinds and nothing real as `would reject`.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Enforcing since 2026-09-23. Ships in log mode first by design; the flip was
// made on evidence rather than a timer: every caller in the codebase lands in
// an allowed bucket — DB triggers carry the Vault dispatch secret,
// waitlist-sweeper / cancel-registration / the web Stripe webhook use the
// service-role key, and the three admin screens (Communications composer,
// review invitations, email preview) call as a signed-in admin. The mobile app
// never calls this function at all. email_log shows no real send since the
// gate deployed, so the logs alone would have proved nothing either way.
export const EMAIL_GATE_MODE: "log" | "enforce" = "enforce";

export type CallerKind = "dispatch" | "service" | "admin" | "non_admin" | "anon" | "unverifiable";

const ALLOWED: ReadonlySet<CallerKind> = new Set(["dispatch", "service", "admin"]);

/** Length-independent comparison, so a near-miss key is not timed out of us. */
export function sameSecret(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function bearerOf(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

async function classify(req: Request, service: SupabaseClient): Promise<CallerKind> {
  // 1. The database, via the Vault dispatch secret.
  const dispatch = req.headers.get("x-dispatch-secret");
  if (dispatch) {
    const { data, error } = await service.rpc("is_valid_push_dispatch", { p_candidate: dispatch });
    if (error) {
      console.error(`[email-gate] dispatch validation failed: ${error.message}`);
      return "unverifiable";
    }
    if (data === true) return "dispatch";
    // A wrong secret is not upgraded by whatever bearer came with it.
    return "anon";
  }

  const token = bearerOf(req);
  if (!token) return "anon";

  // 2. Server code with the service-role key.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && sameSecret(token, serviceKey)) return "service";

  // 3. A signed-in user — admin or not. The anon key has no user and lands
  //    in the `anon` bucket here.
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser(token);
  if (userError || !userData?.user) return "anon";

  const { data: isAdmin, error: adminError } = await asUser.rpc("is_admin");
  if (adminError) {
    console.error(`[email-gate] is_admin failed: ${adminError.message}`);
    return "unverifiable";
  }
  return isAdmin === true ? "admin" : "non_admin";
}

/**
 * Returns a 401 Response when the request must be refused, or null to proceed.
 * `service` must be a SERVICE-ROLE client (is_valid_push_dispatch is granted
 * to service_role only). Logs the caller KIND only — never a token, secret or
 * recipient.
 */
export async function checkEmailCaller(req: Request, service: SupabaseClient): Promise<Response | null> {
  const kind = await classify(req, service);

  if (ALLOWED.has(kind)) {
    if (EMAIL_GATE_MODE === "log") console.log(`[email-gate] ok (${kind})`);
    return null;
  }

  if (EMAIL_GATE_MODE === "log") {
    console.warn(`[email-gate] would reject (${kind})`);
    return null;
  }

  console.warn(`[email-gate] rejected (${kind})`);
  return new Response("Unauthorized", { status: 401 });
}
