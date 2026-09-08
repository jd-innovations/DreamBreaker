import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Development/test-only fixture: flips a profile straight to
// coach_status = 'test_ready' so offer/purchase/redemption/payout workflows
// can be exercised without real Stripe Connect onboarding. See the
// coach_status column comment (20260809150000 migration) — this status is
// structurally unreachable any other way, and is_coach_publish_ready()
// treats it as sufficient specifically BECAUSE this route (and therefore
// the status) cannot exist in a production deployment.
//
// Same defense-in-depth guard as web/src/app/api/dev/simulate-payment:
// hard 404 in production, and a second 404 unless DEV_TOOLS_SECRET is set
// and echoed back in x-dev-tools-secret.
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const devSecret = process.env.DEV_TOOLS_SECRET;
  if (!devSecret || request.headers.get("x-dev-tools-secret") !== devSecret) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: { userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ is_coach: true, coach_status: "test_ready" })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ userId, coachStatus: "test_ready", simulated: true });
}
