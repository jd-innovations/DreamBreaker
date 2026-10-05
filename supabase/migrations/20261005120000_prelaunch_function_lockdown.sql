-- Pre-public-TestFlight lockdown (owner-approved 2026-10-05).
--
-- The security advisor listed 150 SECURITY DEFINER functions executable by
-- anon. Most are triggers (not callable as RPCs) or deliberately public reads.
-- Seventeen change data with no check on who is calling. Before public testers
-- — the first real strangers — those become:
--
-- ── 1. Server-only: revoke from the API roles ───────────────────────────────
-- Called only by cron (runs as owner), by edge functions with the service-role
-- key, or by other SECURITY DEFINER functions (run as owner). Verified
-- 2026-10-05: no app or web code calls any of them, every edge-function call
-- uses the service client, and every database caller is a definer function.
-- Revoking from anon/authenticated/public changes nothing for those callers.
--
--   payouts   claim_/settle_coach_payout_batch, claim_/settle_facility_payout_batch
--   refunds   settle_coach_refund
--   sweepers  close_expired_tournament_registration, expire_stale_holds,
--             expire_stale_reservation_holds, prune_push_tickets
--   internals recompute_reservation_totals, release_reservation_slots (took ANY
--             profile id), retry_failed_personal_game_par,
--             ensure_personal_match_claims_for_session, personal_match_claim_token,
--             validate_personal_game_ready
--
-- ── 2. join_play_event: app-called, now checks its caller ───────────────────
-- The app uses it only for a player joining THEMSELVES (organizer adds are a
-- direct, RLS-checked insert). It trusted p_claimed_by and
-- p_added_by_organizer, so anyone — signed out — could add "any user" to any
-- open game, flag it organizer-added, or fill a game with fakes. Now: signed in,
-- claimed_by must be null or the caller, and the organizer flag is refused.
--
-- ── 3. Lesson purchases only from live coaches ──────────────────────────────
-- create_coach_offer_purchase gates on is_coach_publish_ready(), which accepts
-- the 'test_ready' fixture coaches (no payout account). A BEFORE INSERT guard on
-- coach_offer_purchases refuses a purchase unless the coach is 'active' — or the
-- buyer is an admin, so the owner can still test against fixtures.
--
-- validate_personal_match_claim stays callable: it is token-gated by design.

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.claim_coach_payout_batch(uuid)',
    'public.claim_facility_payout_batch(uuid)',
    'public.settle_coach_payout_batch(uuid, text, text)',
    'public.settle_facility_payout_batch(uuid, text, text)',
    'public.settle_coach_refund(uuid, text, integer, integer, text)',
    'public.close_expired_tournament_registration()',
    'public.expire_stale_holds()',
    'public.expire_stale_reservation_holds()',
    'public.prune_push_tickets()',
    'public.recompute_reservation_totals(uuid)',
    'public.release_reservation_slots(uuid, uuid)',
    'public.retry_failed_personal_game_par(uuid)',
    'public.ensure_personal_match_claims_for_session(uuid)',
    'public.personal_match_claim_token()',
    'public.validate_personal_game_ready(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ─── join_play_event ────────────────────────────────────────────────────────

create or replace function public.join_play_event(
  p_event_id uuid,
  p_first_name text,
  p_email text,
  p_claimed_by uuid default null,
  p_added_by_organizer boolean default false,
  p_self_rating text default null,
  p_last_initial text default null
)
returns setof play_participants
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event play_events;
  v_count integer;
  v_row   play_participants;
begin
  -- Self-join only (2026-10-05): a signed-in caller, joining as themselves.
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_claimed_by is not null and p_claimed_by <> auth.uid() then
    raise exception 'not_authorized' using errcode = '42501',
      hint = 'You can only join as yourself.';
  end if;
  if coalesce(p_added_by_organizer, false) then
    raise exception 'not_authorized' using errcode = '42501',
      hint = 'Organizer adds do not go through this function.';
  end if;

  -- Lock the event row for the duration of this transaction to prevent races.
  select * into v_event
    from play_events
   where id = p_event_id
   for update;

  if not found then
    raise exception 'event_not_found'
      using errcode = 'P0001', hint = 'No play_event with that id.';
  end if;

  -- Only open events accept new participants.
  if v_event.status <> 'open'::play_event_status then
    raise exception 'event_not_open'
      using errcode = 'P0002', hint = 'Event is not open for registration.';
  end if;

  -- Count current participants under the lock.
  select count(*) into v_count
    from play_participants
   where event_id = p_event_id;

  if v_count >= v_event.max_players then
    raise exception 'event_full'
      using errcode = 'P0003', hint = 'Event has reached max_players capacity.';
  end if;

  -- Block duplicate email per event.
  if exists (
    select 1 from play_participants
     where event_id = p_event_id and email = p_email
  ) then
    raise exception 'duplicate_email'
      using errcode = 'P0004', hint = 'This email is already registered for the event.';
  end if;

  insert into play_participants (
    event_id, first_name, last_initial, email,
    claimed_by, added_by_organizer, self_rating
  ) values (
    p_event_id, p_first_name, p_last_initial, p_email,
    p_claimed_by, false, p_self_rating
  )
  returning * into v_row;

  return next v_row;
end;
$function$;

revoke execute on function public.join_play_event(uuid, text, text, uuid, boolean, text, text) from public, anon;
grant execute on function public.join_play_event(uuid, text, text, uuid, boolean, text, text) to authenticated;

-- ─── Lesson purchases: live coaches only ────────────────────────────────────

create or replace function public.fn_coach_purchase_live_coach_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select p.coach_status into v_status
    from public.coach_offers o
    join public.profiles p on p.id = o.coach_id
   where o.id = new.offer_id;

  if v_status is distinct from 'active' and not public.is_admin() then
    raise exception 'coach_not_live' using errcode = '42501',
      hint = 'This coach is not taking bookings yet.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_coach_purchase_live_coach_only on public.coach_offer_purchases;
create trigger trg_coach_purchase_live_coach_only
  before insert on public.coach_offer_purchases
  for each row execute function public.fn_coach_purchase_live_coach_only();
