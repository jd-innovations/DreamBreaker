import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

// Where Stripe sends someone back after Connect onboarding.
//
// This route is the mechanism that actually records onboarding. The
// account.updated webhook looks like it should do it, but the endpoint is not
// registered as a CONNECT endpoint, so it never receives events for connected
// accounts at all — only for the platform's own. Confirmed 2026-09-01:
// `connect: null` on the only endpoint. Until that is changed in the Stripe
// dashboard, this is the sole moment we learn an account is ready.
//
// It used to assume every account belonged to a director: it updated `profiles`
// and redirected to /director whatever happened. A facility owner finishing
// onboarding therefore landed on a tournaments page being told to finish Stripe
// setup, while their brand-new company account went unrecorded.

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const accountId = searchParams.get("account");

  if (!accountId) {
    return NextResponse.redirect(`${origin}/director?connect_error=missing_account`);
  }

  try {
    const account = await getStripe().accounts.retrieve(accountId);
    const service = createServiceClient();
    const ready = Boolean(account.charges_enabled && account.details_submitted);

    // Is this a facility's account? The id is the durable link — metadata can
    // be edited from the Stripe dashboard, a row in our table cannot.
    const { data: facilityAccount } = await service
      .from("facility_payout_accounts")
      .select("facility_id")
      .eq("stripe_connect_account_id", accountId)
      .maybeSingle();

    if (facilityAccount) {
      await service
        .from("facility_payout_accounts")
        .update({
          onboarded_at: ready ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_connect_account_id", accountId);

      // The public mirror the app reads, so a booking screen never has to join
      // a table it cannot see.
      await service
        .from("facilities")
        .update({ payouts_ready: ready })
        .eq("id", facilityAccount.facility_id);

      // Back to the app, not to a web page. Facility onboarding is started from
      // mobile with openAuthSessionAsync(url, 'pickleballapp://'), which only
      // dismisses the in-app browser when it navigates to that scheme —
      // redirecting to an https:// page leaves the user stranded in a browser
      // looking at a screen meant for somebody else.
      return NextResponse.redirect(
        `pickleballapp://facility/manage?onboarded=${ready ? "1" : "0"}`,
      );
    }

    // Person accounts: director or coach, both on `profiles`.
    if (ready) {
      await service
        .from("profiles")
        .update({ stripe_connect_onboarded_at: new Date().toISOString() })
        .eq("stripe_connect_account_id", accountId);

      return NextResponse.redirect(`${origin}/director?onboarded=1`);
    }

    return NextResponse.redirect(`${origin}/director?connect_incomplete=1`);
  } catch {
    return NextResponse.redirect(`${origin}/director?connect_error=stripe_error`);
  }
}
