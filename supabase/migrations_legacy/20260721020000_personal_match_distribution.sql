-- DreamBreaker PB - Personal match distribution and guest sharing status
-- Phase 2: registered in-app notifications + per-guest manual SMS sharing records.
-- No PAR, claim links, guest conversion, activity feed, AI, or weather logic here.

alter table public.notifications
  add column if not exists idempotency_key text;

create unique index if not exists uq_notifications_idempotency_key
  on public.notifications(idempotency_key)
  where idempotency_key is not null;

create table if not exists public.personal_guest_shares (
  id                     uuid        primary key default gen_random_uuid(),
  session_id             uuid        not null references public.personal_sessions(id) on delete cascade,
  session_participant_id uuid        not null references public.personal_session_participants(id) on delete cascade,
  guest_player_id        uuid        not null references public.personal_guest_players(id) on delete restrict,
  created_by             uuid        not null references public.profiles(id) on delete cascade,
  share_status           text        not null default 'not_shared' check (share_status in ('not_shared', 'share_initiated', 'claimed', 'expired')),
  share_channel          text        not null default 'sms' check (share_channel in ('sms')),
  share_initiated_at     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint personal_guest_shares_unique_participant unique (session_participant_id),
  constraint personal_guest_shares_session_guest_unique unique (session_id, guest_player_id)
);

create index if not exists idx_personal_guest_shares_session on public.personal_guest_shares(session_id);
create index if not exists idx_personal_guest_shares_guest on public.personal_guest_shares(guest_player_id);

drop trigger if exists trg_personal_guest_shares_updated_at on public.personal_guest_shares;
create trigger trg_personal_guest_shares_updated_at
  before update on public.personal_guest_shares
  for each row execute function public.fn_set_updated_at();

alter table public.personal_guest_shares enable row level security;

drop policy if exists "personal_guest_shares: creator read" on public.personal_guest_shares;
create policy "personal_guest_shares: creator read"
  on public.personal_guest_shares for select
  using (created_by = (select auth.uid()));

drop policy if exists "personal_guest_shares: creator update" on public.personal_guest_shares;
create policy "personal_guest_shares: creator update"
  on public.personal_guest_shares for update
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid())) ;

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

  select full_name into v_recorder_name
    from public.profiles
   where id = v_session.created_by;

  select name into v_facility_name
    from public.facilities
   where id = v_session.facility_id;

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  select
    p.profile_id,
    'match_recorded',
    'Match recorded',
    coalesce(v_recorder_name, 'A player') || ' added your match at ' || coalesce(v_facility_name, 'a pickleball session') || '.',
    '/(tabs)/stats',
    'personal-match-recorded:' || p_session_id::text || ':' || p.profile_id::text
  from public.personal_session_participants p
  where p.session_id = p_session_id
    and p.profile_id is not null
    and p.profile_id <> v_session.created_by
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
    p.session_id,
    p.id,
    p.guest_player_id,
    v_session.created_by,
    'not_shared',
    'sms'
  from public.personal_session_participants p
  where p.session_id = p_session_id
    and p.guest_player_id is not null
  on conflict (session_participant_id) do nothing;

  return query
  select
    p.id as session_participant_id,
    p.profile_id,
    p.guest_player_id,
    p.display_name_snapshot as display_name,
    g.phone,
    case when p.profile_id is not null then 'registered' else 'guest' end as participant_kind,
    case
      when p.profile_id = v_session.created_by then 'recorded_by_you'
      when p.profile_id is not null then 'in_app_shared'
      when s.share_status = 'share_initiated' then 'share_initiated'
      else 'not_shared'
    end as delivery_status,
    s.id as guest_share_id
  from public.personal_session_participants p
  left join public.personal_guest_players g on g.id = p.guest_player_id
  left join public.personal_guest_shares s on s.session_participant_id = p.id
  where p.session_id = p_session_id
  order by
    case when p.profile_id = v_session.created_by then 0 when p.profile_id is not null then 1 else 2 end,
    p.created_at;
end;
$$;

create or replace function public.mark_personal_guest_share_initiated(
  p_guest_share_id uuid
)
returns public.personal_guest_shares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.personal_guest_shares;
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

  update public.personal_guest_shares
     set share_status = 'share_initiated',
         share_initiated_at = coalesce(share_initiated_at, now())
   where id = p_guest_share_id
   returning * into v_share;

  return v_share;
end;
$$;

grant execute on function public.complete_personal_session_with_distribution(uuid, uuid, text, text) to authenticated;
grant execute on function public.mark_personal_guest_share_initiated(uuid) to authenticated;
