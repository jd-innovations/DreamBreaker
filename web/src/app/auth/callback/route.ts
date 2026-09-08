import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/supabase/env";
import { isProfileCompleteForEntry } from "@/lib/onboarding/completion";

type CallbackClient = ReturnType<typeof createServerClient>;

/**
 * Marks a redirect so the browser can report the sign-in to analytics.
 *
 * This route cannot do it itself. posthog-js is a browser SDK, and capturing
 * server-side with posthog-node would attach the event to a NEW distinct id
 * rather than the anonymous one already in the visitor's browser — breaking the
 * very identity stitching that makes a funnel work. `auth_started` fires
 * anonymously on the auth page; only the browser can join the two.
 *
 * So the fact travels in the URL and `AnalyticsProvider` acts on it, then
 * strips it. The parameter carries no identity — just which provider — because
 * anything in a URL ends up in history, referrers and server logs.
 */
function withAuthEvent(url: string, provider: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}auth_ok=${encodeURIComponent(provider)}`;
}

/**
 * Which provider signed this user in, or null when it was not a federated
 * sign-in.
 *
 * Deliberately narrow. This route also handles password recovery and email
 * confirmation, and neither is a sign-in worth reporting as auth_succeeded:
 * counting a password reset as an authentication would inflate the funnel with
 * events that had no auth_started.
 */
async function federatedProvider(supabase: CallbackClient): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // NOT app_metadata.provider, which is what the first version of this used
    // and why it never fired. Supabase sets that field from the provider the
    // ACCOUNT WAS CREATED WITH, not the one just used. An account created with
    // email/password and later linked to Google still reports "email" forever,
    // so a real Google sign-in looked non-federated and was silently skipped.
    // Confirmed against a live sign-in on 2026-08-31: auth_started arrived,
    // auth_succeeded did not.
    //
    // identities carries one entry per linked provider, each with its own
    // last_sign_in_at. The most recent one is the provider actually used just
    // now, which is the question being asked.
    type Identity = { provider?: string; last_sign_in_at?: string | null };
    const identities = (user.identities ?? []) as Identity[];
    if (identities.length === 0) return null;

    const mostRecent = identities.reduce((latest: Identity, identity: Identity) => {
      const a = Date.parse(identity.last_sign_in_at ?? "") || 0;
      const b = Date.parse(latest?.last_sign_in_at ?? "") || 0;
      return a > b ? identity : latest;
    }, identities[0]);

    const provider = mostRecent?.provider;
    return provider === "google" || provider === "apple" ? provider : null;
  } catch {
    return null;
  }
}

/**
 * Decides where a freshly-authenticated user lands when the caller did not name
 * a destination.
 *
 * Every branch that is not "definitely incomplete" resolves to the dashboard,
 * on purpose. A `profiles` row always exists for an authenticated user
 * (`fn_handle_new_user` creates it), so a missing row or a failed read means the
 * READ failed — not that the user is new. Sending someone into onboarding on
 * that evidence lets the finalize step overwrite fields they already set, which
 * is why the mobile gate refuses to guess here too
 * (`apps/mobile/src/lib/authGate.ts`).
 */
async function resolveLanding(supabase: CallbackClient): Promise<string> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return "/dashboard";

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, dupr, self_rating, skill_level")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) return "/dashboard";

    return isProfileCompleteForEntry(profile) ? "/dashboard" : "/onboarding";
  } catch {
    return "/dashboard";
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Password-recovery links do not always arrive as `?code=`. Depending on
  // project auth settings GoTrue sends `token_hash` + `type` instead, and a
  // handler that only looks for `code` silently bounces the user back to
  // /auth with a generic failure. apps/mobile/src/lib/auth.ts learned this the
  // same way and handles both shapes; this route now does too.
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // An explicit `next` is always honoured. Password reset depends on it
  // (`?next=/auth/reset`), so the onboarding decision below must never
  // override a caller that asked for somewhere specific.
  const explicitNext = searchParams.get("next");
  const next = explicitNext ?? "/dashboard";

  if (code || tokenHash) {
    const cookieStore = await cookies();
    // Validated accessors rather than `!` assertions: a missing variable is
    // inlined by Next as the string "undefined", which would have produced a
    // client that fails every OAuth exchange with no indication why.
    const supabase = createServerClient(
      getSupabaseUrl(),
      getSupabaseAnonKey(),
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      },
    );

    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          type: (type as "recovery" | "email" | "invite" | "magiclink") ?? "recovery",
          token_hash: tokenHash!,
        });

    if (!error) {
      // Where a caller named a destination, go there. Otherwise decide between
      // the dashboard and onboarding.
      //
      // This closes a real gap: before it, /onboarding was reachable from
      // exactly one place — the email signup handler — so every Google and
      // Apple signup went straight to the dashboard and never onboarded at all.
      const provider = await federatedProvider(supabase);

      if (explicitNext) {
        const target = provider ? withAuthEvent(explicitNext, provider) : explicitNext;
        return NextResponse.redirect(`${origin}${target}`);
      }

      const landing = await resolveLanding(supabase);
      const target = provider ? withAuthEvent(landing, provider) : landing;
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  // Something went wrong — send back to auth with error
  return NextResponse.redirect(`${origin}/auth?error=auth_callback_failed`);
}
