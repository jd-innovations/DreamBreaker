-- Marketplace moderation — admins can remove and restore listings.
--
-- There was no admin-only state: the statuses are active/pending/sold/deleted/
-- expired, and the seller may set any of them on their own row. So "removed by
-- an admin" is modelled as:
--
--   status = 'deleted'   the listing disappears everywhere at once — public
--                        read RLS, search_listings_nearby and browse_listings
--                        all show `active` only, so no app change is needed
--   removed_at set       the marker that it was a MODERATION removal, which a
--                        trigger then protects: the seller cannot reactivate,
--                        edit, or clear it. Only the admin RPCs below can,
--                        and they say so by setting a transaction-local flag
--                        (app.marketplace_moderation) the API cannot reach.
--
-- Who, when and why go to marketplace_moderation_log — append-only, admin-read,
-- no foreign keys (the record outlives the listing and the actors, same design
-- as campaign_audit_log). The seller keeps their row and may still delete it
-- outright; the log is the record either way.
--
-- The seller gets an in-app notification with the reason. No email: the sender
-- does not honour notif_email_enabled (MARKETPLACE_HANDOFF.md).

-- ─── Columns ────────────────────────────────────────────────────────────────

alter table public.marketplace_listings
  add column if not exists removed_at timestamptz;

comment on column public.marketplace_listings.removed_at is
  'Set when an admin removed the listing (status is then ''deleted''). While set, the seller '
  'cannot change the row. Who and why: marketplace_moderation_log.';

create index if not exists marketplace_listings_removed_idx
  on public.marketplace_listings (removed_at)
  where removed_at is not null;

-- ─── Moderation log ─────────────────────────────────────────────────────────

create table if not exists public.marketplace_moderation_log (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,   -- no FK: the record outlives a seller-deleted listing
  actor_id uuid,              -- no FK: the record outlives the admin's account
  action text not null check (action in ('removed', 'restored')),
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.marketplace_moderation_log is
  'Append-only record of admin listing removals and restores. UPDATE, DELETE and TRUNCATE raise.';

create index if not exists marketplace_moderation_log_listing_idx
  on public.marketplace_moderation_log (listing_id, created_at);

create or replace function public.fn_marketplace_moderation_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'marketplace_moderation_log is append-only (% refused)', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists marketplace_moderation_log_no_update_delete on public.marketplace_moderation_log;
create trigger marketplace_moderation_log_no_update_delete
  before update or delete on public.marketplace_moderation_log
  for each row execute function public.fn_marketplace_moderation_log_immutable();

drop trigger if exists marketplace_moderation_log_no_truncate on public.marketplace_moderation_log;
create trigger marketplace_moderation_log_no_truncate
  before truncate on public.marketplace_moderation_log
  for each statement execute function public.fn_marketplace_moderation_log_immutable();

alter table public.marketplace_moderation_log enable row level security;
revoke all on public.marketplace_moderation_log from anon, authenticated;
grant select on public.marketplace_moderation_log to authenticated;

drop policy if exists "marketplace_moderation_log: admin read" on public.marketplace_moderation_log;
create policy "marketplace_moderation_log: admin read"
  on public.marketplace_moderation_log for select to authenticated
  using ((select public.is_admin()));

revoke all on function public.fn_marketplace_moderation_log_immutable() from public, anon, authenticated;

-- ─── Guard: a removed listing belongs to moderation ─────────────────────────

create or replace function public.fn_marketplace_guard_removed()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_moderating boolean := coalesce(current_setting('app.marketplace_moderation', true), '') = 'on';
begin
  if v_moderating then
    return new;
  end if;
  if old.removed_at is not null then
    raise exception 'listing_removed_by_admin' using errcode = '42501',
      hint = 'This listing was removed by an admin and can no longer be changed.';
  end if;
  if new.removed_at is distinct from old.removed_at then
    raise exception 'listing_removed_by_admin' using errcode = '42501',
      hint = 'Only an admin can remove a listing.';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_marketplace_guard_removed() from public, anon, authenticated;

drop trigger if exists trg_marketplace_guard_removed on public.marketplace_listings;
create trigger trg_marketplace_guard_removed
  before update on public.marketplace_listings
  for each row execute function public.fn_marketplace_guard_removed();

-- A seller cannot create a listing that already claims to be removed.
create or replace function public.fn_marketplace_guard_removed_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.removed_at is not null
     and coalesce(current_setting('app.marketplace_moderation', true), '') <> 'on' then
    new.removed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_marketplace_guard_removed_insert() from public, anon, authenticated;

drop trigger if exists trg_marketplace_guard_removed_insert on public.marketplace_listings;
create trigger trg_marketplace_guard_removed_insert
  before insert on public.marketplace_listings
  for each row execute function public.fn_marketplace_guard_removed_insert();

-- ─── admin_list_listings ────────────────────────────────────────────────────
--
-- Every listing in every status, for the moderation screen. Includes the
-- seller's display name (not email) and the open listing reports.

create or replace function public.admin_list_listings(
  p_search text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  brand text,
  model text,
  status text,
  asking_price_cents integer,
  location_city text,
  location_state text,
  created_at timestamptz,
  expires_at timestamptz,
  removed_at timestamptz,
  seller_id uuid,
  seller_name text,
  photo_url text,
  open_reports integer,
  report_reasons text[],
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    l.id, l.title, l.brand, l.model, l.status::text, l.asking_price_cents,
    l.location_city, l.location_state, l.created_at, l.expires_at, l.removed_at,
    l.seller_id, p.full_name,
    (select ph.url from public.marketplace_listing_photos ph
      where ph.listing_id = l.id order by ph.sort_order, ph.created_at limit 1),
    (select count(*)::integer from public.user_reports r
      where r.related_listing_id = l.id and r.status::text = 'pending'),
    (select array_agg(distinct r.reason::text) from public.user_reports r
      where r.related_listing_id = l.id and r.status::text = 'pending'),
    count(*) over ()
  from public.marketplace_listings l
  left join public.profiles p on p.id = l.seller_id
  where (p_status is null
         or (p_status = 'removed' and l.removed_at is not null)
         or (p_status <> 'removed' and l.status::text = p_status and l.removed_at is null))
    and (v_q is null
         or l.title ilike '%' || v_q || '%'
         or l.brand ilike '%' || v_q || '%'
         or l.model ilike '%' || v_q || '%'
         or p.full_name ilike '%' || v_q || '%'
         or l.id::text = v_q)
  order by
    (select count(*) from public.user_reports r
      where r.related_listing_id = l.id and r.status::text = 'pending') desc,
    l.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ─── admin_remove_listing / admin_restore_listing ───────────────────────────

create or replace function public.admin_remove_listing(p_listing_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_seller uuid;
  v_title text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'invalid_reason' using errcode = '22023',
      hint = 'Give a reason of 3 to 500 characters — the seller is shown it.';
  end if;

  perform set_config('app.marketplace_moderation', 'on', true);

  update public.marketplace_listings
     set status = 'deleted', removed_at = now()
   where id = p_listing_id
     and removed_at is null
  returning seller_id, title into v_seller, v_title;

  perform set_config('app.marketplace_moderation', 'off', true);

  if v_seller is null then
    raise exception 'listing_not_removable' using errcode = '55000',
      hint = 'That listing does not exist or is already removed.';
  end if;

  insert into public.marketplace_moderation_log (listing_id, actor_id, action, reason)
  values (p_listing_id, v_actor, 'removed', v_reason);

  insert into public.notifications (user_id, type, title, body, link)
  values (v_seller, 'marketplace_listing_removed',
          'Your listing was removed',
          '"' || left(v_title, 80) || '" was removed by the Pickleball App team: ' || v_reason,
          null);
end;
$$;

create or replace function public.admin_restore_listing(p_listing_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform set_config('app.marketplace_moderation', 'on', true);

  -- Back to active, unless its time ran out while it was down.
  update public.marketplace_listings
     set removed_at = null,
         status = case when expires_at is not null and expires_at <= now()
                       then 'expired'::public.marketplace_listing_status
                       else 'active'::public.marketplace_listing_status end
   where id = p_listing_id
     and removed_at is not null
  returning status::text into v_status;

  perform set_config('app.marketplace_moderation', 'off', true);

  if v_status is null then
    raise exception 'listing_not_restorable' using errcode = '55000',
      hint = 'That listing does not exist or is not removed.';
  end if;

  insert into public.marketplace_moderation_log (listing_id, actor_id, action, reason)
  values (p_listing_id, v_actor, 'restored', null);

  return v_status;
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
--
-- is_admin() inside each function is the boundary; authenticated can call.

revoke all on function public.admin_list_listings(text, text, integer, integer) from public, anon;
revoke all on function public.admin_remove_listing(uuid, text) from public, anon;
revoke all on function public.admin_restore_listing(uuid) from public, anon;
grant execute on function public.admin_list_listings(text, text, integer, integer) to authenticated;
grant execute on function public.admin_remove_listing(uuid, text) to authenticated;
grant execute on function public.admin_restore_listing(uuid) to authenticated;
