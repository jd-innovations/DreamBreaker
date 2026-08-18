-- =============================================================================
-- DreamBreaker PB — join_play_event RPC
-- Migration: 20260629000005_join_play_event_rpc
--
-- Transaction-safe participant insert that prevents:
--   - overfill races (FOR UPDATE lock on play_events row)
--   - joining non-open events
--   - duplicate email per event
-- =============================================================================

create or replace function public.join_play_event(
  p_event_id           uuid,
  p_first_name         text,
  p_email              text,
  p_claimed_by         uuid     default null,
  p_added_by_organizer boolean  default false,
  p_self_rating        text     default null,
  p_last_initial       text     default null
)
returns setof play_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event play_events;
  v_count integer;
  v_row   play_participants;
begin
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

  -- Insert and return the new row.
  insert into play_participants (
    event_id, first_name, last_initial, email,
    claimed_by, added_by_organizer, self_rating
  ) values (
    p_event_id, p_first_name, p_last_initial, p_email,
    p_claimed_by, p_added_by_organizer, p_self_rating
  )
  returning * into v_row;

  return next v_row;
end;
$$;

comment on function public.join_play_event is
  'Transaction-safe participant insert. Locks the play_events row, checks status=open and capacity, blocks duplicate email, then inserts. Raises named exceptions (event_not_found, event_not_open, event_full, duplicate_email) for caller handling.';

grant execute on function public.join_play_event to anon, authenticated;
