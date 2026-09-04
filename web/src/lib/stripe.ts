import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  // Equal to this SDK's own Stripe.ApiVersion (stripe@22.2.1 -> dahlia), and to
  // the pin in supabase/functions/_shared/payments.ts. All three move together
  // or not at all -- the edge functions spent a while on stripe@18 pinned to
  // this dahlia version, so Stripe answered in dahlia while their typings
  // described basil.
  _stripe = new Stripe(key, { apiVersion: "2026-05-27.dahlia", typescript: true });
  return _stripe;
}
