-- Corrects the listing lifetime from 60 days to 30.
--
-- Supersedes 20260909200100 rather than editing it: that migration is already
-- applied, and rewriting an applied file would leave the repo claiming
-- something the database never ran.
--
-- Three places carry the number and all three have to move together: the insert
-- default, the renew extension, and the email copy that tells the seller how
-- long a renewal buys them.

CREATE OR REPLACE FUNCTION "public"."fn_marketplace_listing_lifecycle"()
  RETURNS trigger
  LANGUAGE "plpgsql"
  SET "search_path" TO 'public', 'pg_temp'
  AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.expires_at := coalesce(NEW.expires_at, now() + interval '30 days');
  END IF;

  IF NEW.status = 'sold' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sold') THEN
    NEW.sold_at := coalesce(NEW.sold_at, now());
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status <> 'sold' AND OLD.status = 'sold' THEN
    NEW.sold_at := NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

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
  -- another seller's listing id exists.
  IF v_seller_id IS NULL OR v_seller_id <> auth.uid() THEN
    RAISE EXCEPTION 'listing not found';
  END IF;

  IF v_status = 'deleted' THEN
    RAISE EXCEPTION 'listing is deleted';
  END IF;

  UPDATE public.marketplace_listings
     SET status = CASE WHEN status = 'expired' THEN 'active' ELSE status END,
         expires_at = now() + interval '30 days',
         expiry_warned_at = NULL
   WHERE id = p_listing_id
   RETURNING * INTO v_result;

  RETURN v_result;
END;
$fn$;

COMMENT ON COLUMN "public"."marketplace_listings"."expires_at" IS
  'When the listing stops being discoverable. Set to created_at + 30 days on insert; a seller renews via renew_listing().';

UPDATE public.email_templates
   SET html_body = '<p>Hi {{first_name}},</p><p>Your listing <strong>{{listing_title}}</strong> expires on {{expires_on}}. After that it stops showing in the Marketplace.</p><p>If it is still for sale, renewing takes one tap and keeps it live for another 30 days.</p><p><a href="https://pickleballapp.app/marketplace" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Renew my listing</a></p><p style="font-size:13px;">Already sold it? Mark it Sold in My Listings and you can ignore this.</p>'
 WHERE key = 'marketplace_listing_expiring';

-- Re-date the rows the 60-day backfill already stamped.
--
-- greatest(..., now() + 7 days) again, and the floor matters more at 30 than it
-- did at 60: listings created in early August are already past created_at + 30,
-- so a plain re-date would expire them on the very next sweep with no warning
-- at all. The floor gives them the 7-day window, which also means they DO
-- receive the warning email -- correct, because under a 30-day policy they are
-- genuinely stale.
UPDATE public.marketplace_listings
   SET expires_at = greatest(created_at + interval '30 days', now() + interval '7 days')
 WHERE status IN ('active', 'pending');

-- Non-live rows need no grace: the sweeper only touches active/pending, so a
-- past date on a sold or deleted listing is inert and just records when it
-- would have lapsed.
UPDATE public.marketplace_listings
   SET expires_at = created_at + interval '30 days'
 WHERE status NOT IN ('active', 'pending');
