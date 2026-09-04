-- Pins search_path on the six remaining SECURITY DEFINER functions in public
-- (TODO1.1 item 2.2: "Review every SECURITY DEFINER function for explicit
-- authorization and set search_path").
--
-- A SECURITY DEFINER function runs with the owner's privileges but resolves
-- unqualified names through the CALLER's search_path. Anything not
-- schema-qualified -- including operators, casts and implicit function calls --
-- can therefore be resolved to an attacker-controlled object shadowing the
-- intended one. `set search_path` closes that by fixing resolution at
-- definition time.
--
-- 90 of the 99 SECURITY DEFINER functions here already do this; these six were
-- missed. The other three the linter reports (st_estimatedextent) belong to
-- PostGIS and are not ours to change.
--
-- The first three are the highest-leverage of the set: they are called from
-- inside RLS policies, so they sit on the authorization path itself.
--
-- Bodies are unchanged -- this migration only adds the search_path setting.
-- CREATE OR REPLACE keeps the existing triggers attached to the last three.

-- ── RLS policy helpers ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."current_user_is_director"()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  select is_director from public.profiles where id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION "public"."current_user_director_status"()
RETURNS "public"."director_status"
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  select director_status from public.profiles where id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION "public"."is_approved_director"()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (role = 'director' or is_director = true)
       and director_status = 'approved'
  );
$function$;

-- ── Trigger functions ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."create_partner_match_on_mutual_like"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_a uuid;
  v_b uuid;
begin
  -- only act on 'like' kind
  if new.kind <> 'like' then
    return new;
  end if;

  -- check whether the recipient already liked the sender
  if not exists (
    select 1 from public.partner_likes
    where from_user_id = new.to_user_id
      and to_user_id   = new.from_user_id
      and kind         = 'like'
  ) then
    return new;
  end if;

  -- normalise pair
  if new.from_user_id < new.to_user_id then
    v_a := new.from_user_id;
    v_b := new.to_user_id;
  else
    v_a := new.to_user_id;
    v_b := new.from_user_id;
  end if;

  insert into public.partner_matches (user_a, user_b)
  values (v_a, v_b)
  on conflict (user_a, user_b) do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION "public"."notify_group_invite"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_group_name text;
  v_inviter_name text;
begin
  select name into v_group_name from public.groups where id = new.group_id;
  select full_name into v_inviter_name from public.profiles where id = new.inviter_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.invitee_id,
    'group_invite',
    'New group invite',
    coalesce(v_inviter_name, 'Someone') || ' invited you to join ' || coalesce(v_group_name, 'a group'),
    '/groups/' || new.group_id
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION "public"."notify_play_event_invite"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_event_name text;
  v_inviter_name text;
begin
  select name into v_event_name from public.play_events where id = new.play_event_id;
  select full_name into v_inviter_name from public.profiles where id = new.inviter_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.invitee_id,
    'play_event_invite',
    'New game invite',
    coalesce(v_inviter_name, 'Someone') || ' invited you to ' || coalesce(v_event_name, 'a game'),
    '/community/' || new.play_event_id
  );
  return new;
end;
$function$;
