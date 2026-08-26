import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/supabase/env";

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
  const next = searchParams.get("next") ?? "/dashboard";

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
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send back to auth with error
  return NextResponse.redirect(`${origin}/auth?error=auth_callback_failed`);
}
