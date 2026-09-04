import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripe, getServiceClient } from "../_shared/payments.ts";

// Stripe Connect onboarding for the mobile app.
//
// The web route (web/src/app/api/stripe/connect/start/route.ts) does the same
// job but authenticates with a Next.js cookie session, which the app does not
// have — it holds a Supabase JWT. Mobile therefore had NO Connect flow at all,
// for any role: three screens tell the user to "connect Stripe payouts on the
// Pickleball App website" and none of them can link anywhere, because no
// coach-facing web page exists either. This is the missing half.
//
// Role-generic on purpose. The web route already branches only on eligibility
// and comments that a third role reuses the same account-creation path; this
// keeps that property so directors (blocked from charging an entry fee until
// they onboard) and coaches are served by one function.
//
// Deliberately mirrors the web route rather than improving on it: one Express
// account per profile, reused if present, with a freshly minted AccountLink
// every call because AccountLinks expire in minutes. Divergence between the
// two would be a payments bug nobody sees until a payout fails.

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type ConnectRole = "director" | "coach" | "facility";

type ProfileRow = {
  id: string;
  email: string | null;
  is_director: boolean | null;
  director_status: string | null;
  is_coach: boolean | null;
  coach_status: string | null;
  stripe_connect_account_id: string | null;
  role: string | null;
};

// Same predicate as the web route, kept identical wording and all.
function isEligible(role: ConnectRole, p: ProfileRow): boolean {
  if (role === "director") {
    return Boolean(p.is_director || p.role === "director") && p.director_status === "approved";
  }
  // coach: must have self-activated (is_coach) and not already be a
  // confirmed/restricted account — onboarding is for accounts still
  // establishing (or re-establishing) real Connect readiness.
  return Boolean(p.is_coach) && p.coach_status !== "restricted";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: CORS });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "not_authenticated" }), { status: 401, headers: CORS });
  }

  let role: ConnectRole = "coach";
  let facilityId = "";
  try {
    const body = await req.json();
    if (body?.role === "director") role = "director";
    if (body?.role === "facility") role = "facility";
    if (typeof body?.facilityId === "string") facilityId = body.facilityId;
  } catch {
    // No body — default to coach. Note this differs from the web route, whose
    // no-body default is "director" purely for backward compatibility with the
    // director page that predates the role parameter. Mobile always sends one.
  }

  const serviceForFacility = getServiceClient();

  // ── Facility: a company account, owned by the venue ────────────────────────
  //
  // Split out before the profile lookup because none of the profile-role
  // eligibility below applies. What matters here is a facility_members OWNER
  // row: a manager runs the courts, but accepting Stripe's terms on the
  // company's behalf is the owner's call.
  //
  // business_type "company" is set explicitly rather than left for Stripe to
  // ask. It is the whole point — a club's payouts belong to its EIN, not to
  // the individual completing the form, who is only the representative.
  if (role === "facility") {
    if (!facilityId) {
      return new Response(JSON.stringify({ error: "facility_required" }), { status: 400, headers: CORS });
    }

    const { data: membership } = await serviceForFacility
      .from("facility_members")
      .select("role")
      .eq("facility_id", facilityId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membership?.role !== "owner") {
      return new Response(JSON.stringify({ error: "not_facility_owner" }), { status: 403, headers: CORS });
    }

    const { data: facility } = await serviceForFacility
      .from("facilities")
      .select("id, name, website, phone, city, state, postal_code, address")
      .eq("id", facilityId)
      .single();

    if (!facility) {
      return new Response(JSON.stringify({ error: "facility_not_found" }), { status: 404, headers: CORS });
    }

    const { data: existing } = await serviceForFacility
      .from("facility_payout_accounts")
      .select("stripe_connect_account_id")
      .eq("facility_id", facilityId)
      .maybeSingle();

    try {
      const stripe = getStripe();
      let accountId = existing?.stripe_connect_account_id ?? "";

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "express",
          business_type: "company",
          // Prefilled so the club manager is confirming what we hold rather
          // than retyping it. Everything else — EIN, the representative's ID,
          // beneficial owners — Stripe collects, and we never see or store it.
          company: {
            name: facility.name,
            phone: facility.phone ?? undefined,
            address: {
              line1: facility.address ?? undefined,
              city: facility.city ?? undefined,
              state: facility.state ?? undefined,
              postal_code: facility.postal_code ?? undefined,
              country: "US",
            },
          },
          business_profile: { url: facility.website ?? undefined, name: facility.name },
          metadata: { facility_id: facilityId, claimed_by: user.id },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        accountId = account.id;

        const { error: saveError } = await serviceForFacility
          .from("facility_payout_accounts")
          .insert({
            facility_id: facilityId,
            stripe_connect_account_id: accountId,
            created_by: user.id,
          });

        if (saveError) {
          // Same reasoning as the profile path: a retry would mint a SECOND
          // company account, and the orphan is invisible from the app.
          console.error("[create-connect-onboarding-link] facility account created but not saved", saveError);
          return new Response(JSON.stringify({ error: "account_save_failed" }), { status: 500, headers: CORS });
        }
      }

      const origin = Deno.env.get("APP_ORIGIN") ?? "https://pickleballapp.app";
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/api/stripe/connect/start?facility=${facilityId}`,
        return_url: `${origin}/api/stripe/connect/return?account=${accountId}`,
        type: "account_onboarding",
      });

      return new Response(JSON.stringify({ url: accountLink.url }), { headers: CORS });
    } catch (err) {
      console.error("[create-connect-onboarding-link] facility", err);
      return new Response(JSON.stringify({ error: "onboarding_link_failed" }), { status: 500, headers: CORS });
    }
  }

  // Service client for the profile read/write: stripe_connect_account_id is
  // not client-writable, and the eligibility fields must not be read through a
  // client the caller could influence.
  const service = getServiceClient();

  const { data, error: profileError } = await service
    .from("profiles")
    .select("id, email, is_director, director_status, is_coach, coach_status, stripe_connect_account_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !data) {
    return new Response(JSON.stringify({ error: "profile_not_found" }), { status: 404, headers: CORS });
  }

  const profile = data as ProfileRow;

  if (!isEligible(role, profile)) {
    return new Response(
      JSON.stringify({ error: role === "director" ? "not_approved_director" : "coach_mode_not_activated" }),
      { status: 403, headers: CORS },
    );
  }

  try {
    const stripe = getStripe();

    // One Express account per profile, shared across roles — a person who is
    // both a director and a coach gets paid through a single account.
    let accountId = profile.stripe_connect_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
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
        // The Stripe account exists but is not recorded. Failing loudly beats
        // returning a link: a retry would mint a SECOND account, and the
        // orphan is invisible from the app.
        console.error("[create-connect-onboarding-link] account created but not saved", updateError);
        return new Response(JSON.stringify({ error: "account_save_failed" }), { status: 500, headers: CORS });
      }
    }

    // Fresh AccountLink each call — they expire after a few minutes, so one
    // can never be cached or reused.
    const origin = Deno.env.get("APP_ORIGIN") ?? "https://pickleballapp.app";
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/api/stripe/connect/start`,
      return_url: `${origin}/api/stripe/connect/return?account=${accountId}`,
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url }), { headers: CORS });
  } catch (err) {
    console.error("[create-connect-onboarding-link]", err);
    return new Response(JSON.stringify({ error: "onboarding_link_failed" }), { status: 500, headers: CORS });
  }
});
