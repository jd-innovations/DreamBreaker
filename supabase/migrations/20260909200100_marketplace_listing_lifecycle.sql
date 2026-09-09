-- Listings expire after 60 days, with a warning email 7 days out and a one-tap
-- renew. Modelled on close_expired_tournaments (20260831030000), including its
-- governing principle:
--
--   'completed' is a claim about the real world that a clock cannot verify.
--
-- Same rule here. A sweeper may assert 'expired' -- staleness is exactly what a
-- clock knows -- but it must NEVER assert 'sold'. Only the seller knows that,
-- and sold_at is therefore set by a trigger on their action, not by cron.
--
-- Why expiry is not merely cosmetic: fetchActiveListingCount counts active +
-- pending against the free-tier listing limit, so expiring a listing silently
-- frees one of the seller's slots. That makes the warning email and the renew
-- path part of the feature, not polish -- without them the app appears to
-- delete listings.

-- == Columns =================================================================

ALTER TABLE "public"."marketplace_listings"
  ADD COLUMN IF NOT EXISTS "expires_at"       timestamptz,
  ADD COLUMN IF NOT EXISTS "sold_at"          timestamptz,
  -- Set when the warning goes out, so a sweeper running every 15 minutes does
  -- not email the same seller 96 times a day. This is the idempotency guard.
  ADD COLUMN IF NOT EXISTS "expiry_warned_at" timestamptz;

COMMENT ON COLUMN "public"."marketplace_listings"."expires_at" IS
  'When the listing stops being discoverable. Set to created_at + 60 days on insert; a seller renews via renew_listing().';
COMMENT ON COLUMN "public"."marketplace_listings"."sold_at" IS
  'Set by trigger when the SELLER marks it sold. Never set by the expiry sweeper -- a clock cannot know a paddle changed hands.';

CREATE INDEX IF NOT EXISTS "idx_marketplace_listings_expires_at"
  ON "public"."marketplace_listings" ("expires_at")
  WHERE "status" IN ('active', 'pending');

-- == Defaults + sold_at, on write ============================================

CREATE OR REPLACE FUNCTION "public"."fn_marketplace_listing_lifecycle"()
  RETURNS trigger
  LANGUAGE "plpgsql"
  SET "search_path" TO 'public', 'pg_temp'
  AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.expires_at := coalesce(NEW.expires_at, now() + interval '60 days');
  END IF;

  -- Seller marked it sold. Stamp when, once.
  IF NEW.status = 'sold' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sold') THEN
    NEW.sold_at := coalesce(NEW.sold_at, now());
  END IF;

  -- Back on the market: clear the sale stamp so history cannot claim both.
  IF TG_OP = 'UPDATE' AND NEW.status <> 'sold' AND OLD.status = 'sold' THEN
    NEW.sold_at := NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE TRIGGER "trg_marketplace_listing_lifecycle"
  BEFORE INSERT OR UPDATE OF status, expires_at
  ON "public"."marketplace_listings"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_marketplace_listing_lifecycle"();

-- == Renew ===================================================================
-- The counterpart to expiry. Without it, expiring is indistinguishable from
-- the app deleting someone's listing.

CREATE OR REPLACE FUNCTION "public"."renew_listing"(p_listing_id uuid)
  RETURNS "public"."marketplace_listings"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $fn$
DECLARE
  v_seller_id uuid;
  v_status    marketplace_listing_status;
  v_result    public.marketplace_listings;
BEGIN
  SELECT seller_id, status INTO v_seller_id, v_status
    FROM public.marketplace_listings WHERE id = p_listing_id;

  -- Same "not found" for a missing row and someone else's row: do not confirm
  -- another seller's listing id exists. Mirrors set_default_payment_method.
  IF v_seller_id IS NULL OR v_seller_id <> auth.uid() THEN
    RAISE EXCEPTION 'listing not found';
  END IF;

  IF v_status = 'deleted' THEN
    RAISE EXCEPTION 'listing is deleted';
  END IF;

  UPDATE public.marketplace_listings
     SET status = CASE WHEN status = 'expired' THEN 'active' ELSE status END,
         expires_at = now() + interval '60 days',
         expiry_warned_at = NULL
   WHERE id = p_listing_id
   RETURNING * INTO v_result;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION "public"."renew_listing"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."renew_listing"(uuid) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."renew_listing"(uuid) TO "authenticated";

-- == Sweeper =================================================================

CREATE OR REPLACE FUNCTION "public"."expire_stale_listings"()
  RETURNS integer
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $fn$
DECLARE
  v_expired integer;
  r         record;
BEGIN
  -- 1. Warn, 7 days out, once per listing. Done BEFORE expiring so a listing
  --    always gets its warning even if both windows are crossed in one run.
  FOR r IN
    SELECT l.id, l.title, l.expires_at, p.email, p.full_name
      FROM public.marketplace_listings l
      JOIN public.profiles p ON p.id = l.seller_id
     WHERE l.status IN ('active', 'pending')
       AND l.expiry_warned_at IS NULL
       AND l.expires_at IS NOT NULL
       AND l.expires_at <= now() + interval '7 days'
       AND l.expires_at > now()
       AND p.email IS NOT NULL
  LOOP
    INSERT INTO public.notifications(user_id, type, title, body, link)
    SELECT l.seller_id, 'marketplace_listing_expiring', 'Listing expiring soon',
           '"' || r.title || '" expires in 7 days. Renew it to keep it listed.',
           '/marketplace/my-listings'
      FROM public.marketplace_listings l WHERE l.id = r.id;

    PERFORM public.fn_send_transactional_email(jsonb_build_object(
      'to', r.email,
      'templateKey', 'marketplace_listing_expiring',
      'variables', jsonb_build_object(
        'first_name', coalesce(split_part(r.full_name, ' ', 1), 'there'),
        'listing_title', r.title,
        'expires_on', to_char(r.expires_at, 'FMMon FMDD')
      ),
      'idempotencyKey', 'listing-expiring/' || r.id
    ));

    UPDATE public.marketplace_listings SET expiry_warned_at = now() WHERE id = r.id;
  END LOOP;

  -- 2. Expire. Deliberately does NOT touch 'sold' or 'deleted', and never sets
  --    'sold' -- see the header.
  UPDATE public.marketplace_listings
     SET status = 'expired'
   WHERE status IN ('active', 'pending')
     AND expires_at IS NOT NULL
     AND expires_at <= now();
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  RETURN v_expired;
END;
$fn$;

COMMENT ON FUNCTION "public"."expire_stale_listings"() IS
  'Warns sellers 7 days before a listing expires, then moves expired active/pending listings to expired. Scheduled every 15 minutes. Never sets sold -- only the seller knows that.';

REVOKE ALL ON FUNCTION "public"."expire_stale_listings"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."expire_stale_listings"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."expire_stale_listings"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."expire_stale_listings"() TO "service_role";

-- == Email template ==========================================================

INSERT INTO public.email_templates (key, name, subject, html_body, variables, layout, preheader)
VALUES (
  'marketplace_listing_expiring',
  'Marketplace listing expiring',
  'Your listing expires in 7 days',
  '<p>Hi {{first_name}},</p><p>Your listing <strong>{{listing_title}}</strong> expires on {{expires_on}}. After that it stops showing in the Marketplace.</p><p>If it is still for sale, renewing takes one tap and keeps it live for another 60 days.</p><p><a href="https://pickleballapp.app/marketplace" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Renew my listing</a></p><p style="font-size:13px;">Already sold it? Mark it Sold in My Listings and you can ignore this.</p>',
  ARRAY['first_name', 'listing_title', 'expires_on'],
  'transactional',
  '{{listing_title}} expires on {{expires_on}}.'
)
ON CONFLICT (key) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_body = EXCLUDED.html_body,
  variables = EXCLUDED.variables,
  layout = EXCLUDED.layout,
  preheader = EXCLUDED.preheader;

-- == Backfill ================================================================
-- The sweeper only sees rows with an expires_at. Existing listings have none,
-- so they would never expire. Dated from created_at, which is the honest clock
-- for a listing that has been sitting there.
--
-- Anything already older than 60 days gets a 7-day grace window instead of
-- expiring on the first sweep -- retroactively expiring someone's live listing
-- with no warning is not a migration's business.

UPDATE public.marketplace_listings
   SET expires_at = greatest(created_at + interval '60 days', now() + interval '7 days')
 WHERE expires_at IS NULL
   AND status IN ('active', 'pending');

UPDATE public.marketplace_listings
   SET expires_at = created_at + interval '60 days'
 WHERE expires_at IS NULL;

UPDATE public.marketplace_listings
   SET sold_at = updated_at
 WHERE status = 'sold' AND sold_at IS NULL;

-- == Schedule ================================================================
-- Every 15 minutes, matching close-expired-tournament-registration and the
-- other sweepers. Direct SQL call, not an edge function: nothing external is
-- involved beyond the email helper, which is itself a SQL function.

SELECT cron.schedule(
  'expire-stale-listings',
  '*/15 * * * *',
  $cron$select public.expire_stale_listings();$cron$
);
