-- Push dispatch secret — Phase 0a of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
--
-- ── The hole ────────────────────────────────────────────────────────────────
--
-- send-message-push is an open relay. Its only gate is verify_jwt, and the JWT
-- every caller presents is the project's ANON key — which ships inside the
-- mobile app and is committed in this repo's migrations. Anyone holding it can
-- POST { tokens, title, body } and push arbitrary text to any Expo token they
-- know, under DreamBreaker's name. push-receipt-sweeper is open the same way.
--
-- ── The fix, in this migration ──────────────────────────────────────────────
--
-- Every legitimate caller is inside this database: notify_new_message (DMs),
-- fn_notify_price_drop (marketplace) and the push-receipt-sweeper cron job.
-- They now add an `x-dispatch-secret` header read from Vault at call time, and
-- the two functions check it with is_valid_push_dispatch().
--
-- Vault is the ONLY copy of the secret. An earlier design also held it as an
-- edge-function secret; the two drifted twice while being set up, and a drift
-- here is silent — net.http_post is fire-and-forget, so a mismatch just stops
-- delivery. With one copy, rotation is a single vault.update_secret().
--
-- The functions ship in LOG-ONLY mode first (_shared/dispatch-gate.ts), so this
-- migration and the deploys can land in either order without breaking a push.
-- Enforcement is a later one-line change + redeploy, after the logs show every
-- real call validating.
--
-- The secret value never appears in this file. It is read by name.

-- ─── private schema ─────────────────────────────────────────────────────────
--
-- Not in PostgREST's exposed schemas, and no API role gets USAGE. The header
-- helper below RETURNS the secret, so it must be unreachable from the API even
-- if someone later grants EXECUTE by mistake. Public-schema functions pick up
-- anon/authenticated EXECUTE from Supabase's default privileges; this schema
-- has none.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ─── private.push_dispatch_headers() ────────────────────────────────────────
--
-- The headers every internal caller sends. One definition, so the three
-- callers cannot drift from each other. The Authorization value is the public
-- anon key, unchanged — verify_jwt stays on as an outer gate, but it is not the
-- authorization boundary. The dispatch secret is.
--
-- A missing Vault row yields an empty header rather than an error: raising in
-- here would roll back the message INSERT that fired the trigger. An empty
-- header is refused (or, in log-only mode, logged) by the function instead.

create or replace function private.push_dispatch_headers()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo',
    'x-dispatch-secret', coalesce(
      (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_dispatch_secret'),
      ''
    )
  );
$$;

revoke all on function private.push_dispatch_headers() from public, anon, authenticated, service_role;

-- ─── public.is_valid_push_dispatch(text) ────────────────────────────────────
--
-- Called by the edge functions with the service-role client. Returns only a
-- boolean — never the secret.
--
-- Compares SHA-256 digests rather than the raw strings: text equality exits at
-- the first differing byte, which is a timing signal; digests of a guess share
-- nothing useful with digests of the secret. False, never an exception, for a
-- null or empty candidate or a missing Vault row.
--
-- service_role only. Reachable by anon or authenticated it would be a free
-- guessing oracle.

create or replace function public.is_valid_push_dispatch(p_candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select extensions.digest(p_candidate, 'sha256') = extensions.digest(s.decrypted_secret, 'sha256')
       from vault.decrypted_secrets s
      where s.name = 'push_dispatch_secret'
        and p_candidate is not null
        and length(p_candidate) > 0
        and length(s.decrypted_secret) > 0),
    false
  );
$$;

revoke all on function public.is_valid_push_dispatch(text) from public, anon, authenticated;
grant execute on function public.is_valid_push_dispatch(text) to service_role;

-- ─── notify_new_message ─────────────────────────────────────────────────────
--
-- Replaced whole (repo convention — the body is the contract). Identical to the
-- live body from 20260921120000_block_enforcement except the headers, which now
-- come from private.push_dispatch_headers(). Recipient, mute, preference and
-- block resolution are unchanged.

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sender_name text;
  v_tokens text[];
  v_title text;
  v_body text;
begin
  select full_name into v_sender_name from public.profiles where id = new.sender_id;

  select array_agg(distinct pt.expo_push_token) into v_tokens
    from public.push_tokens pt
   where pt.user_id in (
     select recips.user_id
       from (
         select participant_a as user_id from public.conversations
          where id = new.conversation_id and participant_a is not null
         union
         select participant_b as user_id from public.conversations
          where id = new.conversation_id and participant_b is not null
         union
         select user_id from public.conversation_participants
          where conversation_id = new.conversation_id
       ) recips
      where recips.user_id != new.sender_id
        and not exists (
          select 1 from public.conversation_participant_settings s
           where s.conversation_id = new.conversation_id
             and s.user_id = recips.user_id
             and s.muted_until is not null
             and s.muted_until > now()
        )
        and exists (
          select 1 from public.profiles p
           where p.id = recips.user_id
             and p.notif_messages is not false
        )
        and not is_blocked_between(new.sender_id, recips.user_id)
   );

  if v_tokens is null or array_length(v_tokens, 1) is null then
    return new;
  end if;

  v_title := coalesce(v_sender_name, 'New message');
  v_body := left(new.body, 120);

  perform net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-message-push',
    headers := private.push_dispatch_headers(),
    body := jsonb_build_object(
      'tokens', to_jsonb(v_tokens),
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object('conversationId', new.conversation_id, 'messageId', new.id)
    )
  );

  return new;
end;
$function$;

-- ─── fn_notify_price_drop ───────────────────────────────────────────────────
--
-- The second caller of send-message-push (20260909230000). Missed by the
-- original Phase 0 plan; without this it would stop pushing the moment the
-- gate enforces. Identical to the live body except the headers.

create or replace function public.fn_notify_price_drop()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
    headers := private.push_dispatch_headers(),
    body := jsonb_build_object(
      'tokens', to_jsonb(v_tokens),
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object('listingId', NEW.id, 'type', 'marketplace_price_drop')
    )
  );

  RETURN NEW;
END;
$function$;

-- ─── push-receipt-sweeper cron job ──────────────────────────────────────────
--
-- cron.schedule with an existing job name updates that job in place. Same
-- schedule as 20260831010100; only the headers change. The job runs as
-- postgres, which owns private.push_dispatch_headers().

select cron.schedule(
  'push-receipt-sweeper',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/push-receipt-sweeper',
    headers := private.push_dispatch_headers(),
    body := '{}'::jsonb
  );
  $$
);
