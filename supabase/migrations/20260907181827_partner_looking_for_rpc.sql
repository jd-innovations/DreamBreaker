-- Partner Finder needs to read a candidate's actively_looking + game_types
-- from partner_preferences, but that table's only policy is "owner_all"
-- (auth.uid() = user_id) -- so the cross-user read useFinderCandidates.ts
-- already attempts has never actually returned other users' rows under RLS.
-- Verified live against prod: `select policyname, cmd, qual from pg_policies
-- where tablename = 'partner_preferences'` returns exactly one row, ALL
-- commands, owner-only.
--
-- Fix is a narrow SECURITY DEFINER RPC, not a broadened SELECT policy --
-- partner_preferences also holds skill_ranges/distance_idx/gender_preference/
-- age_preference, which are the caller's own business and must stay
-- unreadable by other users. This function returns only the two fields the
-- Partner Finder card actually needs.
create or replace function public.get_partner_looking_for(candidate_ids uuid[])
returns table(user_id uuid, actively_looking boolean, game_types text[])
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select pp.user_id, pp.actively_looking, pp.game_types
  from public.partner_preferences pp
  where pp.user_id = any(candidate_ids)
$$;

-- Postgres grants EXECUTE to PUBLIC on every newly created function by
-- default, and anon inherits that grant -- see checkin_admin_rpc_revoke_public
-- (20260823010000) for the same gotcha caught here previously. Revoke it
-- explicitly rather than relying on the absence of a grant statement: this
-- function is SECURITY DEFINER, so an anonymous caller reaching it would read
-- every row in partner_preferences (though only the three selected columns),
-- not just the caller's own.
revoke all on function public.get_partner_looking_for(uuid[]) from public;
revoke all on function public.get_partner_looking_for(uuid[]) from anon;

grant execute on function public.get_partner_looking_for(uuid[]) to authenticated;
