import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const accountId = searchParams.get("account");

  if (!accountId) {
    return NextResponse.redirect(`${origin}/director?connect_error=missing_account`);
  }

  try {
    const account = await getStripe().accounts.retrieve(accountId);
    const service = createServiceClient();

    if (account.charges_enabled && account.details_submitted) {
      // Onboarding complete — stamp the timestamp
      await service
        .from("profiles")
        .update({ stripe_connect_onboarded_at: new Date().toISOString() })
        .eq("stripe_connect_account_id", accountId);

      return NextResponse.redirect(`${origin}/director?onboarded=1`);
    } else {
      // Director returned early without finishing
      return NextResponse.redirect(`${origin}/director?connect_incomplete=1`);
    }
  } catch {
    return NextResponse.redirect(`${origin}/director?connect_error=stripe_error`);
  }
}
