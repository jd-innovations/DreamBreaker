-- User directory search: find a player by name or handle.
--
-- ── Why this is an RPC and not a client query ───────────────────────────────
--
-- One requirement cannot be met client-side. `blocked_users` is readable only
-- by the blocker — deliberately, so nobody can enumerate who has blocked them
-- (see lib/services/blocking.ts). A client can therefore filter out people IT
-- blocked, but not people who blocked IT. is_blocked_between() covers both
-- directions, and only a SECURITY DEFINER function can call it usefully here.
--
-- Two other defects of the client-side searchPlayers() it replaces:
--
--   * it ignored `is_discoverable`. 18 of 51 production profiles had opted out
--     of discovery and were still returned by new-message and event invites.
--     The Partner Finder honoured the flag; this did not.
--   * it searched full_name only, never handle.
--
-- ── mutual_count ────────────────────────────────────────────────────────────
--
-- Returned because a rating does not make a stranger tappable and a shared
-- connection does — it is the single most prominent thing on a Facebook search
-- row, and it is doing the trust work there. Counts players connected to BOTH
-- the caller and the candidate. Results sort connected-first, then by mutuals,
-- then by name.
--
-- Callers with no session get zero rows rather than an error: `me.uid is not
-- null` short-circuits, so a signed-out render cannot leak the directory.
create or replace function public.search_players(p_query text, p_limit integer default 25)
returns table (
  id uuid,
  full_name text,
  handle text,
  avatar_url text,
  dupr numeric,
  self_rating text,
  location_city text,
  location_state text,
  is_connected boolean,
  mutual_count integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (select auth.uid() as uid),
  my_conns as (
    select case when pm.user_a = (select uid from me) then pm.user_b else pm.user_a end as id
      from public.partner_matches pm
     where (select uid from me) is not null
       and ((select uid from me) in (pm.user_a, pm.user_b))
  ),
  q as (select nullif(btrim(coalesce(p_query, '')), '') as term)
  select
    p.id,
    p.full_name,
    p.handle,
    p.avatar_url,
    p.dupr,
    p.self_rating,
    p.location_city,
    p.location_state,
    exists (select 1 from my_conns c where c.id = p.id) as is_connected,
    (
      select count(*)::integer
        from public.partner_matches pm2
       where p.id in (pm2.user_a, pm2.user_b)
         and (case when pm2.user_a = p.id then pm2.user_b else pm2.user_a end)
             in (select c.id from my_conns c)
    ) as mutual_count
  from public.profiles p, q, me
 where me.uid is not null
   and q.term is not null
   and length(q.term) >= 2
   and p.id <> me.uid
   and p.is_discoverable = true
   and p.deleted_at is null
   and (p.full_name ilike '%' || q.term || '%' or p.handle ilike '%' || q.term || '%')
   and not public.is_blocked_between(me.uid, p.id)
 order by
   exists (select 1 from my_conns c where c.id = p.id) desc,
   (
     select count(*)
       from public.partner_matches pm3
      where p.id in (pm3.user_a, pm3.user_b)
        and (case when pm3.user_a = p.id then pm3.user_b else pm3.user_a end)
            in (select c.id from my_conns c)
   ) desc,
   p.full_name asc
 limit least(greatest(coalesce(p_limit, 25), 1), 50);
$$;

revoke all on function public.search_players(text, integer) from public;
revoke all on function public.search_players(text, integer) from anon;
grant execute on function public.search_players(text, integer) to authenticated;

comment on function public.search_players(text, integer) is
  'User directory search by name or handle. SECURITY DEFINER for one reason that cannot be done client-side: blocked_users is readable only by the blocker, deliberately, so a client can filter out people IT blocked but not people who blocked IT. is_blocked_between() covers both directions. Also enforces is_discoverable, which the previous client-side searchPlayers() ignored. Returns a mutual-connection count because that, not a rating, is what makes a stranger tappable.';
