-- Admin moderation for coach offers (Phase 2, owner-approved 2026-09-23).
--
-- 33 offers exist and nothing has ever been able to take one down. Marketplace
-- listings got this on 2026-09-22; this is deliberately the SAME shape, down
-- to the column and function names, so an admin who has used one screen
-- already knows the other and a future reader finds one pattern rather than
-- two:
--
--   removed_at set   the marker of a MODERATION removal, which the coach
--                    cannot undo. Distinct from 'archived', which is the
--                    coach's own choice, so the two are never confused.
--   a log            every action, with actor and reason, append only.
--   three RPCs       list / remove / restore, each checking is_admin().
--
-- ── Why not just archive it ─────────────────────────────────────────────────
-- A coach can archive and unarchive their own offers. If moderation used the
-- same state, the coach could simply put a removed offer back. removed_at is
-- guarded: only a moderation call may set or clear it, and while it is set the
-- row is frozen to its owner.
--
-- ── Restore ────────────────────────────────────────────────────────────────
-- Puts the offer back to PAUSED, never straight to active. A removal means
-- something was wrong; the coach should look before it sells again. The
-- marketplace equivalent restores to active-or-expired because a listing has
-- no such review step — the difference is deliberate.

alter table public.coach_offers
  add column if not exists removed_at timestamptz;

comment on column public.coach_offers.removed_at is
  'Set when an ADMIN removed this offer. Distinct from status=archived, which '
  'is the coach''s own choice: a removed offer is frozen and the coach cannot '
  'undo it. Guarded by trg_coach_offer_guard_removed.';

create index if not exists coach_offers_removed_idx
  on public.coach_offers (removed_at) where removed_at is not null;

create table if not exists public.coach_offer_moderation_log (
  id         uuid primary key default gen_random_uuid(),
  offer_id   uuid not null references public.coach_offers(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,
  action     text not null check (action in ('removed', 'restored')),
  reason     text,
  created_at timestamptz not null default now()
);

create index if not exists coach_offer_moderation_log_offer_idx
  on public.coach_offer_moderation_log (offer_id, created_at desc);

alter table public.coach_offer_moderation_log enable row level security;

drop policy if exists coach_offer_moderation_log_admin_read on public.coach_offer_moderation_log;
create policy coach_offer_moderation_log_admin_read
  on public.coach_offer_moderation_log for select to authenticated using (public.is_admin());

revoke all on public.coach_offer_moderation_log from anon;
grant select on public.coach_offer_moderation_log to authenticated;

-- Append only: a moderation record that can be edited is not a record.
create or replace function public.fn_coach_offer_moderation_log_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'coach_offer_moderation_log is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists trg_coach_offer_moderation_log_immutable on public.coach_offer_moderation_log;
create trigger trg_coach_offer_moderation_log_immutable
  before update or delete on public.coach_offer_moderation_log
  for each row execute function public.fn_coach_offer_moderation_log_immutable();

-- ─── Guards ─────────────────────────────────────────────────────────────────

create or replace function public.fn_coach_offer_guard_removed()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_moderating boolean := coalesce(current_setting('app.coach_moderation', true), '') = 'on';
begin
  if v_moderating then
    return new;
  end if;
  if old.removed_at is not null then
    raise exception 'offer_removed_by_admin' using errcode = '42501',
      hint = 'This offer was removed by an admin and can no longer be changed.';
  end if;
  if new.removed_at is distinct from old.removed_at then
    raise exception 'offer_removed_by_admin' using errcode = '42501',
      hint = 'Only an admin can remove an offer.';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_coach_offer_guard_removed() from public, anon, authenticated;

drop trigger if exists trg_coach_offer_guard_removed on public.coach_offers;
create trigger trg_coach_offer_guard_removed
  before update on public.coach_offers
  for each row execute function public.fn_coach_offer_guard_removed();

-- A coach cannot create an offer that already claims to be removed.
create or replace function public.fn_coach_offer_guard_removed_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.removed_at is not null
     and coalesce(current_setting('app.coach_moderation', true), '') <> 'on' then
    new.removed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_coach_offer_guard_removed_insert() from public, anon, authenticated;

drop trigger if exists trg_coach_offer_guard_removed_insert on public.coach_offers;
create trigger trg_coach_offer_guard_removed_insert
  before insert on public.coach_offers
  for each row execute function public.fn_coach_offer_guard_removed_insert();

-- ─── Discovery must not show a removed offer ────────────────────────────────
-- Both public functions gain the same filter. Without this a removed offer
-- would still be browsable, which is the entire point of removing it.

create or replace function public.browse_coach_offers(
  p_search       text default null,
  p_offer_type   text default null,
  p_min_cents    integer default null,
  p_max_cents    integer default null,
  p_city         text default null,
  p_state        text default null,
  p_sort         text default 'newest',
  p_limit        integer default 24,
  p_offset       integer default 0
)
returns table (
  id uuid, title text, offer_type text, description text, skill_level_label text,
  duration_minutes integer, max_participants integer, lessons_included integer,
  regular_price_cents integer, discounted_price_cents integer, premium_only boolean,
  premium_price_cents integer, quantity_remaining integer, coach_id uuid, coach_name text,
  coach_handle text, coach_avatar_url text, facility_id uuid, facility_name text,
  city text, state text, latitude double precision, longitude double precision,
  photo_url text, created_at timestamptz, total_count bigint
)
language sql stable security definer set search_path = '' as $$
  with base as (
    select o.*,
           p.full_name coach_name, p.handle coach_handle, p.avatar_url coach_avatar_url,
           f.name facility_name, f.city facility_city, f.state facility_state,
           f.latitude::double precision lat, f.longitude::double precision lng,
           coalesce(
             (select i.url from public.coach_offer_images i
               where i.coach_offer_id = o.id order by i.sort_order, i.created_at limit 1),
             (select ph.url from public.facility_photos ph
               where ph.facility_id = o.facility_id
               order by ph.is_primary desc nulls last, ph.created_at limit 1)
           ) photo_url
      from public.coach_offers o
      join public.profiles p on p.id = o.coach_id and p.deleted_at is null
      left join public.facilities f on f.id = o.facility_id
     where o.status = 'active'
       and o.removed_at is null
       and (o.quantity_available is null or coalesce(o.quantity_remaining, 0) > 0)
       and (p_offer_type is null or o.offer_type::text = p_offer_type)
       and (p_min_cents is null or coalesce(o.discounted_price_cents, o.regular_price_cents) >= p_min_cents)
       and (p_max_cents is null or coalesce(o.discounted_price_cents, o.regular_price_cents) <= p_max_cents)
       and (p_city is null or f.city ilike p_city)
       and (p_state is null or f.state ilike p_state)
       and (
         p_search is null or btrim(p_search) = '' or
         o.title ilike '%' || btrim(p_search) || '%' or
         o.description ilike '%' || btrim(p_search) || '%' or
         p.full_name ilike '%' || btrim(p_search) || '%' or
         f.name ilike '%' || btrim(p_search) || '%'
       )
  ), counted as (
    select *, count(*) over () total_count from base
  )
  select c.id, c.title, c.offer_type::text, c.description, c.skill_level_label,
         c.duration_minutes, c.max_participants, c.lessons_included,
         c.regular_price_cents, c.discounted_price_cents,
         c.premium_only, c.premium_price_cents, c.quantity_remaining,
         c.coach_id, c.coach_name, c.coach_handle, c.coach_avatar_url,
         c.facility_id, c.facility_name, c.facility_city, c.facility_state,
         c.lat, c.lng, c.photo_url, c.created_at, c.total_count
    from counted c
   order by
     case when p_sort = 'price_low'  then coalesce(c.discounted_price_cents, c.regular_price_cents) end asc,
     case when p_sort = 'price_high' then coalesce(c.discounted_price_cents, c.regular_price_cents) end desc,
     case when p_sort = 'newest' or p_sort is null then c.created_at end desc,
     c.created_at desc
   limit greatest(least(coalesce(p_limit, 24), 60), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.coach_offer_detail(p_id uuid)
returns table (
  id uuid, title text, offer_type text, description text, terms text,
  skill_level_label text, duration_minutes integer, max_participants integer,
  lessons_included integer, regular_price_cents integer, discounted_price_cents integer,
  premium_only boolean, premium_price_cents integer, quantity_remaining integer,
  purchase_limit_per_customer integer, status text, coach_id uuid, coach_name text,
  coach_handle text, coach_avatar_url text, coach_bio text, facility_id uuid,
  facility_name text, facility_address text, city text, state text,
  latitude double precision, longitude double precision, photo_url text
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.title, o.offer_type::text, o.description, o.terms, o.skill_level_label,
         o.duration_minutes, o.max_participants, o.lessons_included,
         o.regular_price_cents, o.discounted_price_cents,
         o.premium_only, o.premium_price_cents, o.quantity_remaining,
         o.purchase_limit_per_customer, o.status::text,
         o.coach_id, p.full_name, p.handle, p.avatar_url, p.bio,
         o.facility_id, f.name, f.address, f.city, f.state,
         f.latitude::double precision, f.longitude::double precision,
         coalesce(
           (select i.url from public.coach_offer_images i
             where i.coach_offer_id = o.id order by i.sort_order, i.created_at limit 1),
           (select ph.url from public.facility_photos ph
             where ph.facility_id = o.facility_id
             order by ph.is_primary desc nulls last, ph.created_at limit 1)
         )
    from public.coach_offers o
    join public.profiles p on p.id = o.coach_id and p.deleted_at is null
    left join public.facilities f on f.id = o.facility_id
   where o.id = p_id
     and o.removed_at is null
     and o.status::text in ('active', 'paused');
$$;

-- ─── admin_list_coach_offers ────────────────────────────────────────────────

create or replace function public.admin_list_coach_offers(
  p_search text default null,
  p_status text default null,
  p_offset integer default 0
)
returns table (
  id uuid, title text, offer_type text, status text, removed_at timestamptz,
  regular_price_cents integer, discounted_price_cents integer,
  quantity_remaining integer, coach_id uuid, coach_name text, coach_email text,
  facility_name text, city text, state text, created_at timestamptz,
  purchase_count integer, last_removed_reason text, total_count bigint
)
language sql stable security definer set search_path = '' as $$
  with base as (
    select o.id, o.title, o.offer_type::text offer_type, o.status::text status, o.removed_at,
           o.regular_price_cents, o.discounted_price_cents, o.quantity_remaining,
           o.coach_id, p.full_name coach_name,
           -- The coach's email IS shown here, unlike anywhere public: an admin
           -- taking something down needs to reach the person who posted it.
           p.email coach_email,
           f.name facility_name, f.city, f.state, o.created_at,
           (select count(*) from public.coach_offer_purchases cp where cp.offer_id = o.id)::integer purchase_count,
           (select l.reason from public.coach_offer_moderation_log l
             where l.offer_id = o.id and l.action = 'removed'
             order by l.created_at desc limit 1) last_removed_reason
      from public.coach_offers o
      join public.profiles p on p.id = o.coach_id
      left join public.facilities f on f.id = o.facility_id
     where public.is_admin()
       and (p_status is null or p_status = ''
            or (p_status = 'removed' and o.removed_at is not null)
            or (p_status <> 'removed' and o.status::text = p_status and o.removed_at is null))
       and (
         p_search is null or btrim(p_search) = '' or
         o.title ilike '%' || btrim(p_search) || '%' or
         p.full_name ilike '%' || btrim(p_search) || '%' or
         p.email ilike '%' || btrim(p_search) || '%' or
         o.id::text = btrim(p_search)
       )
  )
  select b.*, count(*) over () total_count
    from base b
   -- Removed first (they are what an admin revisits), then newest.
   order by (b.removed_at is not null) desc, b.created_at desc
   limit 25 offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.admin_list_coach_offers(text, text, integer) from public, anon;
grant execute on function public.admin_list_coach_offers(text, text, integer) to authenticated;

-- ─── admin_remove_coach_offer ───────────────────────────────────────────────

create or replace function public.admin_remove_coach_offer(p_offer_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_coach uuid;
  v_title text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  -- A reason is not optional: it is what the coach is told, and what the log
  -- has to show months later.
  if length(v_reason) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select coach_id, title into v_coach, v_title from public.coach_offers where id = p_offer_id;
  if v_coach is null then
    raise exception 'offer_not_found' using errcode = 'P0002';
  end if;

  perform set_config('app.coach_moderation', 'on', true);

  update public.coach_offers
     set status = 'archived', removed_at = now(), updated_at = now()
   where id = p_offer_id
     and removed_at is null;

  insert into public.coach_offer_moderation_log (offer_id, actor_id, action, reason)
  values (p_offer_id, v_actor, 'removed', v_reason);

  insert into public.notifications (user_id, type, title, body, link)
  values (v_coach, 'coach_offer_removed',
          'Your lesson was removed',
          '"' || left(coalesce(v_title, 'Your lesson'), 80) || '" was removed by the Pickleball App team: ' || v_reason,
          null);
end;
$$;

revoke all on function public.admin_remove_coach_offer(uuid, text) from public, anon;
grant execute on function public.admin_remove_coach_offer(uuid, text) to authenticated;

-- ─── admin_restore_coach_offer ──────────────────────────────────────────────

create or replace function public.admin_restore_coach_offer(p_offer_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_coach uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select coach_id into v_coach from public.coach_offers where id = p_offer_id and removed_at is not null;
  if v_coach is null then
    raise exception 'offer_not_removed' using errcode = 'P0002';
  end if;

  perform set_config('app.coach_moderation', 'on', true);

  -- Back to PAUSED, never straight to active: a removal meant something was
  -- wrong, and the coach should look at it before it sells again.
  update public.coach_offers
     set removed_at = null, status = 'paused', updated_at = now()
   where id = p_offer_id;

  insert into public.coach_offer_moderation_log (offer_id, actor_id, action, reason)
  values (p_offer_id, v_actor, 'restored', null);

  insert into public.notifications (user_id, type, title, body, link)
  values (v_coach, 'coach_offer_restored',
          'Your lesson is back',
          'It is paused so you can review it before it goes live again.',
          '/coach/offers');

  return 'paused';
end;
$$;

revoke all on function public.admin_restore_coach_offer(uuid) from public, anon;
grant execute on function public.admin_restore_coach_offer(uuid) to authenticated;
