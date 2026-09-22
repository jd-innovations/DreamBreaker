-- Phase 0b, step 2: the push triggers send an id, not a token list.
-- PUSH_BROADCAST_IMPLEMENTATION_PLAN.md (0b moved into Phase 2).
--
-- APPLY ONLY AFTER send-message-push understands { kind, … } payloads
-- (deployed with ACCEPT_LEGACY_TOKENS = true). Applied before that, every DM
-- and price-drop push would be refused — silently, since net.http_post is
-- fire-and-forget.
--
-- After this, neither trigger decides who receives a push or what it says.
-- They name the row; send-message-push resolves recipients and text through
-- resolve_message_push_recipients / resolve_price_drop_push_recipients
-- (20260921200000), which hold the recipient rules verbatim from the bodies
-- replaced here.
--
-- Each trigger keeps one cheap guard — "does anyone other than the actor have
-- a device at all?" — so a message in a conversation where nobody has the app
-- does not cost an edge-function invocation. It is deliberately NOT the full
-- rule (mutes, preferences, blocks): that lives in one place, the resolver.
-- A guard that passes and a resolver that finds nobody just yields `skipped`.
--
-- Rollback: CREATE OR REPLACE with the bodies from 20260921180000, which still
-- send tokens — valid only while ACCEPT_LEGACY_TOKENS is true.

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1
      from public.push_tokens pt
     where pt.user_id <> new.sender_id
       and pt.user_id in (
         select participant_a from public.conversations where id = new.conversation_id
         union
         select participant_b from public.conversations where id = new.conversation_id
         union
         select user_id from public.conversation_participants where conversation_id = new.conversation_id
       )
  ) then
    return new;
  end if;

  perform net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-message-push',
    headers := private.push_dispatch_headers(),
    body := jsonb_build_object('kind', 'message', 'messageId', new.id)
  );

  return new;
end;
$function$;

create or replace function public.fn_notify_price_drop()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
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
  -- happened -- so it is not gated on the push preference. It is ALSO where
  -- the push takes its text from: resolve_price_drop_push_recipients reads
  -- this row, so the request below carries no price for anyone to invent.
  INSERT INTO public.notifications(user_id, type, title, body, link)
  SELECT s.user_id, 'marketplace_price_drop', v_title, v_body, '/marketplace/' || NEW.id
    FROM public.marketplace_saved_listings s
   WHERE s.listing_id = NEW.id
     -- A seller editing their own price does not need telling.
     AND s.user_id <> NEW.seller_id;

  IF NOT EXISTS (
    SELECT 1
      FROM public.push_tokens pt
      JOIN public.marketplace_saved_listings s ON s.user_id = pt.user_id
     WHERE s.listing_id = NEW.id
       AND s.user_id <> NEW.seller_id
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-message-push',
    headers := private.push_dispatch_headers(),
    body := jsonb_build_object('kind', 'price_drop', 'listingId', NEW.id)
  );

  RETURN NEW;
END;
$function$;
