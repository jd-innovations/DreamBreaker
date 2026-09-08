-- DreamBreaker PB - Fix ambiguous column reference in personal match distribution RPC
-- RETURNS TABLE(...) creates implicit PL/pgSQL variables (e.g. session_participant_id)
-- that collide with the personal_guest_shares.session_participant_id column inside the
-- ON CONFLICT (session_participant_id) target, which cannot be table-qualified. Adding
-- #variable_conflict use_column makes bare column references resolve to table columns.

create or replace function public.complete_personal_session_with_distribution(
  p_session_id uuid,
  p_facility_id uuid default null,
  p_notes text default null,
  p_indoor_outdoor text default null
)
returns table (
  session_participant_id uuid,
  profile_id uuid,
  guest_player_id uuid,
  display_name text,
  phone text,
  participant_kind text,
  delivery_status text,
  guest_share_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_session public.personal_sessions;
  v_recorder_name text;
  v_facility_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  v_session := public.complete_personal_session(p_session_id, p_facility_id, p_notes, p_indoor_outdoor);

  if v_session.created_by <> auth.uid() then
    raise exception 'not_session_creator' using errcode = 'P0001';
  end if;

  select prof.full_name into v_recorder_name
    from public.profiles prof
   where prof.id = v_session.created_by;

  select fac.name into v_facility_name
    from public.facilities fac
   where fac.id = v_session.facility_id;

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  select
    participant.profile_id,
    'match_recorded',
    'Match recorded',
    coalesce(v_recorder_name, 'A player') || ' added your match at ' || coalesce(v_facility_name, 'a pickleball session') || '.',
    '/(tabs)/stats',
    'personal-match-recorded:' || p_session_id::text || ':' || participant.profile_id::text
  from public.personal_session_participants participant
  where participant.session_id = p_session_id
    and participant.profile_id is not null
    and participant.profile_id <> v_session.created_by
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  insert into public.personal_guest_shares (
    session_id,
    session_participant_id,
    guest_player_id,
    created_by,
    share_status,
    share_channel
  )
  select
    participant.session_id,
    participant.id,
    participant.guest_player_id,
    v_session.created_by,
    'not_shared',
    'sms'
  from public.personal_session_participants participant
  where participant.session_id = p_session_id
    and participant.guest_player_id is not null
  on conflict (session_participant_id) do nothing;

  return query
  select
    participant.id::uuid as session_participant_id,
    participant.profile_id::uuid as profile_id,
    participant.guest_player_id::uuid as guest_player_id,
    participant.display_name_snapshot::text as display_name,
    guest.phone::text as phone,
    (case when participant.profile_id is not null then 'registered' else 'guest' end)::text as participant_kind,
    (case
      when participant.profile_id = v_session.created_by then 'recorded_by_you'
      when participant.profile_id is not null then 'in_app_shared'
      when share.share_status = 'share_initiated' then 'share_initiated'
      else 'not_shared'
    end)::text as delivery_status,
    share.id::uuid as guest_share_id
  from public.personal_session_participants participant
  left join public.personal_guest_players guest on guest.id = participant.guest_player_id
  left join public.personal_guest_shares share on share.session_participant_id = participant.id
  where participant.session_id = p_session_id
  order by
    case when participant.profile_id = v_session.created_by then 0 when participant.profile_id is not null then 1 else 2 end,
    participant.created_at;
end;
$$;

grant execute on function public.complete_personal_session_with_distribution(uuid, uuid, text, text) to authenticated;
