import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";

// Verification hook for crash reporting (TODO1.1_EXECUTION_PLAN.md 4.1).
//
// "Done when: production crashes are actionable" cannot be checked by reading
// code — an event has to reach the dashboard from a real deployment, with the
// right release and environment tags. This route is how that gets proven, now
// and after any future change to the Sentry wiring.
//
// Gated on an authenticated ADMIN rather than the DEV_TOOLS_SECRET pattern used
// by /api/dev/*, because those routes hard-404 when NODE_ENV=production — which
// is exactly the environment that needs verifying. An admin session is a gate
// that works identically in production without weakening anything: it grants no
// capability beyond generating an error attributed to the caller.
//
// Deliberately not a public endpoint. Sentry's free tier is 5k events/month;
// an unauthenticated "make an error" URL is a quota-exhaustion button.

export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // 404, not 403: a non-admin should not learn this route exists.
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const kind = new URL(request.url).searchParams.get("kind");

  // Captured rather than thrown, so the caller gets a readable confirmation
  // instead of a 500 page and has the event id to search for in Sentry.
  if (kind === "capture") {
    // Report what the SDK is ACTUALLY doing, not what we hoped.
    //
    // The first version of this route returned `ok: true` and an event id and
    // nothing else, which made it useless: captureException() mints an id and
    // returns it even when Sentry was never initialised, so a completely inert
    // SDK produced a response indistinguishable from a working one. That cost
    // an afternoon on 2026-08-25 — the route looked healthy while zero events
    // had ever reached the project.
    //
    // getClient() is the honest signal: undefined means init never ran.
    const client = Sentry.getClient();
    const options = client?.getOptions();

    const eventId = Sentry.captureException(
      new Error("Sentry verification: captured server-side event (4.1)"),
    );
    const flushed = await Sentry.flush(2000);

    return NextResponse.json({
      // The only field that means anything. False = nothing was transmitted,
      // whatever the event id says.
      sdkInitialised: Boolean(client),
      // False means the flush timed out: the event was queued and not delivered.
      flushed,
      eventId,
      dsnConfigured: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
      sdkEnabled: options?.enabled ?? null,
      sdkEnvironment: options?.environment ?? null,
      sdkRelease: options?.release ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      vercelSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    });
  }

  // Default: throw for real, so the path being exercised is the one that
  // matters — an unhandled server error caught by instrumentation's
  // onRequestError, not a manual capture call.
  throw new Error("Sentry verification: unhandled server error (4.1)");
}
