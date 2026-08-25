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
    const eventId = Sentry.captureException(
      new Error("Sentry verification: captured server-side event (4.1)"),
    );
    await Sentry.flush(2000);
    return NextResponse.json({
      ok: true,
      eventId,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    });
  }

  // Default: throw for real, so the path being exercised is the one that
  // matters — an unhandled server error caught by instrumentation's
  // onRequestError, not a manual capture call.
  throw new Error("Sentry verification: unhandled server error (4.1)");
}
