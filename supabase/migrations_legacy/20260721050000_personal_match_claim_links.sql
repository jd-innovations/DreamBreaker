-- DreamBreaker PB - Secure personal match guest claim links
-- Phase 3: hashed per-guest claim tokens and authenticated claim processing.
-- No PAR, confidence, AI, referrals, wallet credits, marketplace, weather, or DUPR integration.

create extension if not exists pgcrypto;

create table if not exists public.personal_match_claims (
  id                     uuid        primary key default gen_random_uuid(),
  session_id             uuid        not null references public.personal_sessions(id) on delete cascade,
  session_participant_id uuid        not null references public.personal_session_participants(id) on delete cascade,
  guest_share_id         uuid        not null references public.personal_guest_shares(id) on delete cascade,
  guest_player_id        uuid        not null references public.personal_guest_players(id) on delete restrict,
  created_by             uuid        not null references public.profiles(id) on delete cascade,
  token_hash             text        not null unique,
  expires_at             timestamptz not null,
  claimed_by_profile_id  uuid        references public.profiles(id) on delete set null,
  claimed_at             timestamptz,
  revoked_at             timestamptz,
  status                 text        not null default 'pending' check (status in ('pending', 'claimed', 'expired', 'revoked')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint personal_match_claims_claimed_fields check (
    (status = 'claimed' and claimed_by_profile_id is not null and claimed_at is not null)
    or (status <> 'claimed')
  )
);

create index if not exists idx_personal_match_claims_guest_share on public.personal_match_claims(guest_share_id);
create index if not exists idx_personal_match_claims_session on public.personal_match_claims(session_id);
create index if not exists idx_personal_match_claims_claimed_by on public.personal_match_claims(claimed_by_profile_id);

create unique index if not exists uq_personal_match_claims_pending_share
  on public.personal_match_claims(guest_share_id)
  where status = 'pending';

create unique index if not exists uq_personal_match_claims_claimed_participant
  on public.personal_match_claims(session_participant_id)
  where status = 'claimed';

drop trigger if exists trg_personal_match_claims_updated_at on public.personal_match_claims;
create trigger trg_personal_match_claims_updated_at
  before update on public.personal_match_claims
  for each row execute function public.fn_set_updated_at();

alter table public.personal_match_claims enable row level security;

drop policy if exists "personal_match_claims: creator read" on public.personal_match_claims;
create policy "personal_match_claims: creator read"
  on public.personal_match_claims for select
  using (created_by = (select auth.uid()));

drop policy if exists "personal_match_claims: claimed owner read" on public.personal_match_claims;
create policy "personal_match_claims: claimed owner read"
  on public.personal_match_claims for select
  using (claimed_by_profile_id = (select auth.uid()));

create or replace function public.personal_match_claim_token()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=')
$$;

create or replace function public.personal_match_claim_hash(p_token text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

create or replace function public.create_personal_match_claim_link(
  p_guest_share_id uuid
)
returns table (
  claim_id uuid,
  guest_share_id uuid,
  token text,
  claim_url text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.personal_guest_shares;
  v_token text;
  v_hash text;
  v_claim public.personal_match_claims;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_share
    from public.personal_guest_shares
   where id = p_guest_share_id;

  if not found then
    raise exception 'guest_share_not_found' using errcode = 'P0001';
  end if;

  if v_share.created_by <> auth.uid() then
    raise exception 'not_guest_share_creator' using errcode = 'P0001';
  end if;

  if v_share.share_status = 'claimed' then
    raise exception 'guest_share_already_claimed' using errcode = 'P0001';
  end if;

  update public.personal_match_claims
     set status = 'revoked', revoked_at = coalesce(revoked_at, now())
   where guest_share_id = p_guest_share_id
     and status = 'pending';

  loop
    v_token := public.personal_match_claim_token();
    v_hash := public.personal_match_claim_hash(v_token);
    exit when not exists (select 1 from public.personal_match_claims c where c.token_hash = v_hash);
  end loop;

  insert into public.personal_match_claims (
    session_id,
    session_participant_id,
    guest_share_id,
    guest_player_id,
    created_by,
    token_hash,
    expires_at
  ) values (
    v_share.session_id,
    v_share.session_participant_id,
    v_share.id,
    v_share.guest_player_id,
    v_share.created_by,
    v_hash,
    now() + interval '30 days'
  ) returning * into v_claim;

  return query select
    v_claim.id,
    v_claim.guest_share_id,
    v_token,
    'dreambreaker://claim/' || v_token,
    v_claim.expires_at;
end;
$$;

create or replace function public.ensure_personal_match_claims_for_session(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.personal_guest_shares;
  v_token text;
  v_hash text;
begin
  for v_share in
    select * from public.personal_guest_shares
     where session_id = p_session_id
       and share_status <> 'claimed'
  loop
    if not exists (
      select 1 from public.personal_match_claims c
       where c.guest_share_id = v_share.id
         and c.status = 'pending'
         and c.expires_at > now()
    ) then
      loop
        v_token := public.personal_match_claim_token();
        v_hash := public.personal_match_claim_hash(v_token);
        exit when not exists (select 1 from public.personal_match_claims c where c.token_hash = v_hash);
      end loop;

      insert into public.personal_match_claims (
        session_id,
        session_participant_id,
        guest_share_id,
        guest_player_id,
        created_by,
        token_hash,
        expires_at
      ) values (
        v_share.session_id,
        v_share.session_participant_id,
        v_share.id,
        v_share.guest_player_id,
        v_share.created_by,
        v_hash,
        now() + interval '30 days'
      );
    end if;
  end loop;
end;
$$;

drop function if exists public.complete_personal_session_with_distribution(uuid, uuid, text, text);
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
  guest_share_id uuid,
  claim_status text
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

  perform public.ensure_personal_match_claims_for_session(p_session_id);

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
      when share.share_status = 'claimed' then 'claimed'
      when share.share_status = 'share_initiated' then 'share_initiated'
      else 'not_shared'
    end)::text as delivery_status,
    share.id::uuid as guest_share_id,
    claim.status::text as claim_status
  from public.personal_session_participants participant
  left join public.personal_guest_players guest on guest.id = participant.guest_player_id
  left join public.personal_guest_shares share on share.session_participant_id = participant.id
  left join lateral (
    select c.status from public.personal_match_claims c
     where c.guest_share_id = share.id
     order by c.created_at desc
     limit 1
  ) claim on true
  where participant.session_id = p_session_id
  order by
    case when participant.profile_id = v_session.created_by then 0 when participant.profile_id is not null then 1 else 2 end,
    participant.created_at;
end;
$$;

create or replace function public.validate_personal_match_claim(
  p_token text
)
returns table (
  status text,
  reason text,
  recorder_name text,
  facility_name text,
  played_at timestamptz,
  guest_name text,
  session_format text,
  games jsonb,
  teams jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_claim public.personal_match_claims;
begin
  if p_token is null or length(btrim(p_token)) < 20 then
    return query select 'invalid'::text, 'invalid_token'::text, null::text, null::text, null::timestamptz, null::text, null::text, '[]'::jsonb, '[]'::jsonb;
    return;
  end if;

  v_hash := public.personal_match_claim_hash(btrim(p_token));

  select * into v_claim
    from public.personal_match_claims c
   where c.token_hash = v_hash;

  if not found then
    return query select 'invalid'::text, 'invalid_token'::text, null::text, null::text, null::timestamptz, null::text, null::text, '[]'::jsonb, '[]'::jsonb;
    return;
  end if;

  if v_claim.status = 'revoked' or v_claim.revoked_at is not null then
    return query select 'invalid'::text, 'revoked'::text, null::text, null::text, null::timestamptz, null::text, null::text, '[]'::jsonb, '[]'::jsonb;
    return;
  end if;

  if v_claim.status = 'claimed' then
    return query
    select 'already_claimed'::text, 'already_claimed'::text, recorder.full_name::text, facility.name::text, session.played_at, participant.display_name_snapshot::text, session.format::text,
      coalesce((select jsonb_agg(jsonb_build_object('gameNumber', game.game_number, 'teamOneScore', game.team_one_score, 'teamTwoScore', game.team_two_score, 'winningTeam', game.winning_team) order by game.game_number) from public.personal_games game where game.session_id = session.id), '[]'::jsonb),
      '[]'::jsonb
    from public.personal_sessions session
    join public.personal_session_participants participant on participant.id = v_claim.session_participant_id
    left join public.profiles recorder on recorder.id = session.created_by
    left join public.facilities facility on facility.id = session.facility_id
    where session.id = v_claim.session_id;
    return;
  end if;

  if v_claim.expires_at <= now() then
    update public.personal_match_claims set status = 'expired' where id = v_claim.id and status = 'pending';
    update public.personal_guest_shares set share_status = 'expired' where id = v_claim.guest_share_id and share_status <> 'claimed';
    return query select 'expired'::text, 'expired'::text, null::text, null::text, null::timestamptz, null::text, null::text, '[]'::jsonb, '[]'::jsonb;
    return;
  end if;

  return query
  select 'valid'::text, null::text, recorder.full_name::text, facility.name::text, session.played_at, participant.display_name_snapshot::text, session.format::text,
    coalesce((select jsonb_agg(jsonb_build_object('gameNumber', game.game_number, 'teamOneScore', game.team_one_score, 'teamTwoScore', game.team_two_score, 'winningTeam', game.winning_team) order by game.game_number) from public.personal_games game where game.session_id = session.id), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('gameNumber', game.game_number, 'teamNumber', gp.team_number, 'position', gp.position, 'name', sp.display_name_snapshot) order by game.game_number, gp.team_number, gp.position)
      from public.personal_games game
      join public.personal_game_participants gp on gp.game_id = game.id
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
      where game.session_id = session.id
    ), '[]'::jsonb)
  from public.personal_sessions session
  join public.personal_session_participants participant on participant.id = v_claim.session_participant_id
  left join public.profiles recorder on recorder.id = session.created_by
  left join public.facilities facility on facility.id = session.facility_id
  where session.id = v_claim.session_id;
end;
$$;

create or replace function public.claim_personal_match(
  p_token text
)
returns table (
  status text,
  reason text,
  session_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_claim public.personal_match_claims;
  v_participant public.personal_session_participants;
  v_session public.personal_sessions;
  v_claimer_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_token is null or length(btrim(p_token)) < 20 then
    return query select 'invalid'::text, 'invalid_token'::text, null::uuid;
    return;
  end if;

  v_hash := public.personal_match_claim_hash(btrim(p_token));

  select * into v_claim
    from public.personal_match_claims c
   where c.token_hash = v_hash
   for update;

  if not found then
    return query select 'invalid'::text, 'invalid_token'::text, null::uuid;
    return;
  end if;

  if v_claim.status = 'claimed' then
    if v_claim.claimed_by_profile_id = auth.uid() then
      return query select 'claimed'::text, null::text, v_claim.session_id;
    else
      return query select 'already_claimed'::text, 'already_claimed'::text, v_claim.session_id;
    end if;
    return;
  end if;

  if v_claim.status = 'revoked' or v_claim.revoked_at is not null then
    return query select 'invalid'::text, 'revoked'::text, null::uuid;
    return;
  end if;

  if v_claim.expires_at <= now() then
    update public.personal_match_claims set status = 'expired' where id = v_claim.id and status = 'pending';
    update public.personal_guest_shares set share_status = 'expired' where id = v_claim.guest_share_id and share_status <> 'claimed';
    return query select 'expired'::text, 'expired'::text, v_claim.session_id;
    return;
  end if;

  select * into v_participant
    from public.personal_session_participants p
   where p.id = v_claim.session_participant_id
   for update;

  if not found or v_participant.session_id <> v_claim.session_id or v_participant.guest_player_id <> v_claim.guest_player_id then
    return query select 'invalid'::text, 'participant_mismatch'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.personal_session_participants p
     where p.session_id = v_claim.session_id
       and p.profile_id = auth.uid()
       and p.id <> v_claim.session_participant_id
  ) then
    return query select 'invalid'::text, 'already_registered_participant'::text, v_claim.session_id;
    return;
  end if;

  select * into v_session from public.personal_sessions where id = v_claim.session_id;

  update public.personal_session_participants
     set profile_id = auth.uid(),
         guest_player_id = null
   where id = v_claim.session_participant_id;

  update public.personal_match_claims
     set status = 'claimed',
         claimed_by_profile_id = auth.uid(),
         claimed_at = coalesce(claimed_at, now())
   where id = v_claim.id;

  update public.personal_guest_shares
     set share_status = 'claimed'
   where id = v_claim.guest_share_id;

  select full_name into v_claimer_name from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (
    v_session.created_by,
    'match_claimed',
    'Match claimed',
    coalesce(v_claimer_name, v_participant.display_name_snapshot, 'A player') || ' claimed the match you recorded.',
    '/(tabs)/stats',
    'personal-match-claimed:' || v_claim.id::text || ':' || v_session.created_by::text
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return query select 'claimed'::text, null::text, v_claim.session_id;
end;
$$;

grant execute on function public.create_personal_match_claim_link(uuid) to authenticated;
grant execute on function public.validate_personal_match_claim(text) to anon, authenticated;
grant execute on function public.claim_personal_match(text) to authenticated;
