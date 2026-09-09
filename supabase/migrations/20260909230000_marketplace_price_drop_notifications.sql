-- Tell people when something they saved gets cheaper.
--
-- IN-APP + PUSH, DELIBERATELY NO EMAIL.
--   1. send-transactional-email does not read profiles.notif_email_enabled --
--      the column is written by the settings screen and honoured by nothing in
--      the send path (EMAIL_NOTIFICATIONS_EXECUTION_PLAN.md Phase 5.5). An
--      email here would reach people who explicitly switched email off.
--   2. A price alert is promotional in character. The email shell withholds the
--      postal address for layout='transactional' on purpose; a promotional send
--      needs layout='marketing' and that address under CAN-SPAM. That is a
--      bigger decision than this feature.
--   3. Push has the right latency anyway. The reason to tell someone is
--      competition for the item.
--
-- Reuses send-message-push, which despite its name takes a generic
-- {tokens, title, body, data} and does no message-specific work.

-- == Preference ==============================================================
-- A new notification type gets its own switch. Reusing notif_tournaments or
-- notif_messages would mean silencing one thing silences another.

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "notif_marketplace" boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN "public"."profiles"."notif_marketplace" IS
  'Price-drop alerts for saved marketplace listings. notif_* is outside the anon column-grant allowlist (20260825120000), so this needs no grant change.';

-- == Trigger =================================================================

CREATE OR REPLACE FUNCTION "public"."fn_notify_price_drop"()
  RETURNS trigger
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $fn$
DECLARE
  v_tokens text[];
  v_drop   integer;
  v_title  text;
  v_body   text;
BEGIN
  -- Only a genuine reduction on a live listing. An increase, a no-op write, or
  -- a price edit on something sold or expired is not news.
  IF NEW.asking_price_cents >= OLD.asking_price_cents THEN RETURN NEW; END IF;
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;

  v_drop := OLD.asking_price_cents - NEW.asking_price_cents;
  v_title := 'Price drop';
  v_body := NEW.title || ' is now $' || to_char(NEW.asking_price_cents / 100.0, 'FM999999990.00')
            || ', down $' || to_char(v_drop / 100.0, 'FM999999990.00') || '.';

  -- In-app for every saver. Cheap, passive, and the list is the record of what
  -- happened -- so it is not gated on the push preference.
  INSERT INTO public.notifications(user_id, type, title, body, link)
  SELECT s.user_id, 'marketplace_price_drop', v_title, v_body, '/marketplace/' || NEW.id
    FROM public.marketplace_saved_listings s
   WHERE s.listing_id = NEW.id
     -- A seller editing their own price does not need telling.
     AND s.user_id <> NEW.seller_id;

  -- Push only for savers who want marketplace alerts. `is not false` matches
  -- notify_new_message: a null means notify, since the column default does.
  SELECT array_agg(DISTINCT pt.expo_push_token) INTO v_tokens
    FROM public.push_tokens pt
    JOIN public.marketplace_saved_listings s ON s.user_id = pt.user_id
    JOIN public.profiles p ON p.id = s.user_id
   WHERE s.listing_id = NEW.id
     AND s.user_id <> NEW.seller_id
     AND p.notif_marketplace IS NOT FALSE;

  IF v_tokens IS NULL OR array_length(v_tokens, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-message-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo'
    ),
    body := jsonb_build_object(
      'tokens', to_jsonb(v_tokens),
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object('listingId', NEW.id, 'type', 'marketplace_price_drop')
    )
  );

  RETURN NEW;
END;
$fn$;

-- AFTER, not BEFORE: this only reads and notifies, and must not run unless the
-- write actually committed to the row.
CREATE OR REPLACE TRIGGER "trg_notify_price_drop"
  AFTER UPDATE OF asking_price_cents
  ON "public"."marketplace_listings"
  FOR EACH ROW
  WHEN (NEW.asking_price_cents < OLD.asking_price_cents)
  EXECUTE FUNCTION "public"."fn_notify_price_drop"();
