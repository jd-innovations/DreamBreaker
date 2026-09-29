-- Guest names in a tournament's brackets, for everyone who can see the bracket.
--
-- personal_guest_players is readable only by the director who created the row
-- ("creator read"), and it also holds a guest's phone and email. Bracket
-- screens join to it for names, so every other viewer (players on mobile,
-- the public web page, the leaderboard) saw a director-added guest as "TBD",
-- and a team of two guests dropped out of the leaderboard entirely.
--
-- This returns ONLY id + display_name, and only for guests who actually appear
-- in this tournament's brackets or registrations, and only when the tournament
-- is past draft / approval (the same point bracket_matches becomes publicly
-- readable) or the caller is its director or an admin. Phone and email never
-- leave the table.

create or replace function public.tournament_guest_names(p_tournament_id uuid)
returns table (guest_id uuid, display_name text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select g.id, g.display_name
    from public.personal_guest_players g
   where exists (
           select 1 from public.tournaments t
            where t.id = p_tournament_id
              and (t.status not in ('draft', 'pending_approval')
                   or t.director_id = (select auth.uid())
                   or public.is_admin())
         )
     and g.id in (
           select unnest(array[m.team1_guest_a, m.team1_guest_b, m.team2_guest_a, m.team2_guest_b])
             from public.bracket_matches m
            where m.tournament_id = p_tournament_id
           union
           select unnest(array[r.guest_player_id, r.guest_partner_id])
             from public.registrations r
            where r.tournament_id = p_tournament_id
         );
$$;

comment on function public.tournament_guest_names(uuid) is
  'Display names (only) of director-added guests in a published tournament''s brackets and registrations, so every viewer sees names instead of TBD. Director/admin also before publishing.';

alter function public.tournament_guest_names(uuid) owner to postgres;
revoke all on function public.tournament_guest_names(uuid) from public;
grant execute on function public.tournament_guest_names(uuid) to anon, authenticated;
