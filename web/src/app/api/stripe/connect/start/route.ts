import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  // Authenticate via cookie session
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch director profile
  const service = createServiceClient();
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, email, full_name, is_director, director_status, stripe_connect_account_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const isApprovedDirector =
    (profile.is_director || (profile as { role?: string }).role === "director") &&
    profile.director_status === "approved";

  if (!isApprovedDirector) {
    return NextResponse.json({ error: "Not an approved director" }, { status: 403 });
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
