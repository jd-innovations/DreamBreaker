import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

// Shared Stripe Connect onboarding entry point (Coach Marketplace Phase 1
// generalization) — one Connect account per profile, whichever role
// (director or coach) is onboarding it. The eligibility check is the only
// role-specific branch; account creation/link generation below is identical
// either way, so a future third role reuses this same route.
type ConnectRole = "director" | "coach";

function isEligible(
  role: ConnectRole,
  profile: { is_director: boolean | null; director_status: string | null; is_coach: boolean | null; coach_status: string | null; role?: string | null },
): boolean {
  if (role === "director") {
    return (profile.is_director || profile.role === "director") && profile.director_status === "approved";
  }
  // coach: must have self-activated (is_coach) and not already be a
  // confirmed/restricted account — onboarding is for accounts still
  // establishing (or re-establishing) real Connect readiness.
  return Boolean(profile.is_coach) && profile.coach_status !== "restricted";
}

export async function POST(request: Request) {
  // Authenticate via cookie session
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let role: ConnectRole = "director";
  try {
    const body = await request.json();
    if (body?.role === "coach") role = "coach";
  } catch {
    // No body (or invalid JSON) — default to the existing director flow so
    // this stays backward-compatible with the current director UI, which
    // calls this route with no body today.
  }

  const service = createServiceClient();
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, email, full_name, is_director, director_status, is_coach, coach_status, stripe_connect_account_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (!isEligible(role, profile)) {
    return NextResponse.json(
      { error: role === "director" ? "Not an approved director" : "Coach Mode has not been activated" },
      { status: 403 },
    );
  }

  // Create a new Express Connected Account if one doesn't exist yet
  let accountId = profile.stripe_connect_account_id;
  if (!accountId) {
    const account = await getStripe().accounts.create({
      type: "express",
      email: profile.email ?? user.email,
      metadata: { profile_id: user.id },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    accountId = account.id;

    const { error: updateError } = await service
      .from("profiles")
      .update({ stripe_connect_account_id: accountId })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to save account ID" }, { status: 500 });
    }
  }

  // Generate a fresh AccountLink (they expire after a few minutes)
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://dreambreakerpb.com";
  const accountLink = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/api/stripe/connect/start`,
    return_url: `${origin}/api/stripe/connect/return?account=${accountId}`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
