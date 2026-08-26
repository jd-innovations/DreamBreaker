import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/supabase/env";
import { isProfileCompleteForEntry } from "@/lib/onboarding/completion";

type CallbackClient = ReturnType<typeof createServerClient>;

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
      if (explicitNext) {
        return NextResponse.redirect(`${origin}${explicitNext}`);
      }

      return NextResponse.redirect(`${origin}${await resolveLanding(supabase)}`);
    }
  }

  // Something went wrong — send back to auth with error
  return NextResponse.redirect(`${origin}/auth?error=auth_callback_failed`);
}
