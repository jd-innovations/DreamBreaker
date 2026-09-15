-- Handles: fix the RULES now, build the feature later.
--
-- `profiles.handle` came in with the production baseline and was never
-- finished: 0 of 51 profiles have one, nothing in the app writes one, and the
-- only consumers render `@handle` conditionally so none of them ever fire.
--
-- The decision (2026-09-15) is that handles stay OPTIONAL and are claimed
-- AFTER signup -- never auto-assigned in fn_handle_new_user(), where a UNIQUE
-- violation would 500 the signup itself. This codebase has already lost
-- signups to exactly that coupling once.
--
-- WHY NOW, WITH NO UI: everything below is free precisely because the column
-- is empty. The same changes made after handles exist are migrations with
-- victims -- deduplicating a case-collision means picking a loser, forcing a
-- rename, and breaking whatever link they already shared. There are no
-- collisions to resolve today because there is nothing to collide.
--
-- Deliberately NOT here: any UI, any claim flow, any backfill. This migration
-- is user-invisible. It makes the wrong states unrepresentable so that
-- whenever a real consumer appears (@mentions, shareable profile links), the
-- feature is a form over rules the database already enforces.

-- ── Case collision, made structurally impossible ────────────────────────────
-- The existing UNIQUE is case-SENSITIVE, so `Jesus` and `jesus` could both be
-- taken -- the classic impersonation bug. Rather than add citext (an extension
-- and a column rewrite), require storage to be lowercase: the regex below
-- admits no uppercase, so profiles_handle_key is now a case-insensitive
-- constraint by construction.
--
-- The character set is settled here, before any /@handle URL can escape into
-- the wild and freeze it. No hyphens, so a handle can never be mistaken for a
-- uuid in a route segment. Must start and end alphanumeric, so `_x_` and
-- trailing underscores are out. 3-20 characters.
--
-- NULL passes a CHECK, which is what keeps handles optional.

alter table public.profiles
  drop constraint if exists profiles_handle_format;

alter table public.profiles
  add constraint profiles_handle_format
  check (handle is null or handle ~ '^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$');

-- ── When it last changed, for the cooldown ──────────────────────────────────

alter table public.profiles
  add column if not exists handle_changed_at timestamptz;

comment on column public.profiles.handle_changed_at is
  'When handle was last set, for set_my_handle()''s cooldown. Null means never set.';

-- ── Names nobody may take ───────────────────────────────────────────────────
-- A table rather than a CHECK so the list can grow without a migration -- the
-- day someone registers a route or a brand name, this needs one insert, not a
-- deploy.

create table if not exists public.reserved_handles (
  handle     text primary key,
  reason     text,
  created_at timestamptz not null default now(),
  constraint reserved_handles_lowercase check (handle = lower(handle))
);

alter table public.reserved_handles enable row level security;

-- Readable by anyone: the claim UI has to be able to say "that one is taken"
-- before the user submits, and the list is not a secret. No write policy for
-- anyone -- this is an admin/service concern.
drop policy if exists "reserved_handles: public read" on public.reserved_handles;
create policy "reserved_handles: public read"
  on public.reserved_handles for select using (true);

insert into public.reserved_handles (handle, reason) values
  ('admin','impersonation'), ('administrator','impersonation'),
  ('support','impersonation'), ('help','impersonation'),
  ('staff','impersonation'),  ('team','impersonation'),
  ('moderator','impersonation'), ('mod','impersonation'),
  ('official','impersonation'), ('verified','impersonation'),
  ('security','impersonation'), ('billing','impersonation'),
  ('payments','impersonation'), ('noreply','impersonation'),
  ('pickleballapp','brand'), ('pickleball','brand'),
  ('pgd','brand'), ('pickleballgripdoctor','brand'),
  ('api','route'), ('www','route'), ('app','route'), ('auth','route'),
  ('login','route'), ('signin','route'), ('signup','route'),
  ('settings','route'), ('profile','route'), ('profiles','route'),
  ('search','route'), ('about','route'), ('legal','route'),
  ('terms','route'), ('privacy','route'), ('wallet','route'),
  ('marketplace','route'), ('tournament','route'), ('tournaments','route'),
  ('coach','route'), ('coaches','route'), ('facility','route'),
  ('facilities','route'), ('booking','route'), ('invites','route'),
  ('messages','route'), ('notifications','route'), ('me','route'),
  ('null','reserved'), ('undefined','reserved'), ('none','reserved'),
  ('test','reserved'), ('root','reserved'), ('system','reserved')
on conflict (handle) do nothing;

-- ── Is this one free? ───────────────────────────────────────────────────────
-- For the claim UI. `handle` is already selectable by anon, so this reveals
-- nothing new; it exists so the availability check and the write path apply
-- the SAME rules. A UI that validated differently from the function would
-- offer a name the server then refuses.

create or replace function public.handle_available(p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v text := lower(btrim(coalesce(p_handle, '')));
begin
  if v !~ '^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$' then
    return jsonb_build_object('available', false, 'reason', 'invalid_format');
  end if;

  if exists (select 1 from public.reserved_handles where handle = v) then
    return jsonb_build_object('available', false, 'reason', 'reserved');
  end if;

  -- Your own handle reads as available, so re-saving an unchanged form does
  -- not present the user with an error about themselves.
  if exists (select 1 from public.profiles
              where handle = v and id is distinct from auth.uid()) then
    return jsonb_build_object('available', false, 'reason', 'taken');
  end if;

  return jsonb_build_object('available', true, 'handle', v);
end;
$function$;

revoke execute on function public.handle_available(text) from public;
grant  execute on function public.handle_available(text) to anon, authenticated;

-- ── Claiming or changing one ────────────────────────────────────────────────
-- The ONLY write path. The `profiles: own update` policy lets a user write any
-- column on their own row, so without the grant revoke below, a client could
-- set handle directly and skip every rule above. The CHECK would still catch a
-- malformed one, but reserved words and the cooldown live here.

create or replace function public.set_my_handle(p_handle text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v      text := lower(btrim(coalesce(p_handle, '')));
  v_prev text;
  v_at   timestamptz;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select handle, handle_changed_at into v_prev, v_at
    from public.profiles where id = v_user for update;

  if v_prev is not distinct from v then
    return jsonb_build_object('ok', true, 'handle', v, 'reason', 'unchanged');
  end if;

  if v !~ '^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$' then
    raise exception 'invalid_format' using errcode = 'P0001',
      hint = '3-20 characters, lowercase letters, digits and underscores, starting and ending with a letter or digit.';
  end if;

  if exists (select 1 from public.reserved_handles where handle = v) then
    raise exception 'reserved_handle' using errcode = 'P0001';
  end if;

  -- 30 days. Not arbitrary: a handle someone has shared should not be able to
  -- churn so fast that it becomes useless as an identifier, and a short window
  -- is what makes name-squatting cheap -- claim, trade, release, repeat.
  if v_at is not null and v_at > now() - interval '30 days' then
    raise exception 'handle_change_too_soon' using errcode = 'P0001',
      hint = 'A handle can be changed once every 30 days.';
  end if;

  begin
    update public.profiles
       set handle = v, handle_changed_at = now()
     where id = v_user;
  exception when unique_violation then
    -- Someone claimed it between the availability check and this write. A
    -- friendly refusal, not a 500: this is a race two people can legitimately
    -- lose, not a fault.
    raise exception 'handle_taken' using errcode = 'P0001';
  end;

  return jsonb_build_object('ok', true, 'handle', v);
end;
$function$;

revoke execute on function public.set_my_handle(text) from public, anon;
grant  execute on function public.set_my_handle(text) to authenticated;

comment on function public.set_my_handle(text) is
  'The only write path for profiles.handle. Validates format, refuses reserved names, enforces a 30-day cooldown, and turns a lost race into handle_taken rather than a 500.';

-- ── Close the direct path ───────────────────────────────────────────────
-- Everything above is advisory while a client can still PATCH the column
-- itself. Nothing in the app writes handle today (verified across mobile, web,
-- SQL and edge functions), so closing this breaks nothing.
--
-- The obvious `revoke update (handle) on public.profiles from authenticated`
-- does NOT work here and fails SILENTLY: UPDATE is granted to authenticated at
-- the TABLE level, and a column-level revoke cannot subtract from a table-level
-- grant. It was applied, and has_column_privilege still returned true.
--
-- The guard is a trigger instead -- see 20260915150000_handle_write_guard.sql.
