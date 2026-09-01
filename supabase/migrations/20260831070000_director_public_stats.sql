-- Real numbers for the director stat strip on the tournament detail screen.
--
-- The strip was hardcoded to "3,842 Players Served / 4.8 Avg Rating (126
-- reviews) / 28 Tournaments Hosted" for every director. The rating is deleted
-- outright in the same change: there is no reviews table anywhere in the
-- schema, so it was invented social proof attached to a real, identifiable
-- person. A reviews system is planned (coaches, paddles, facilities and
-- tournaments all need one) and the rating belongs to that work, not here.
--
-- SECURITY DEFINER is load-bearing, not convenience. registrations is
-- RLS-protected: only the tournament's own director, the player themself, or
-- an admin may read a row. A client-side count would therefore return the true
-- figure to the director and 0 to everyone else — a bug invisible while
-- testing as the director. This returns two integers and no PII.
create or replace function public.director_public_stats(p_director_id uuid)
returns table (players_served integer, tournaments_hosted integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      -- Distinct humans, not registration rows: a doubles entry is two people,
      -- and director-added guests have no account but were still served.
      select count(*)::integer from (
        select r.player_id::text as person
          from registrations r join tournaments t on t.id = r.tournament_id
         where t.director_id = p_director_id
           and r.status in ('registered','checked_in','substitute','no_show','disqualified')
           and r.player_id is not null
        union
        select r.partner_id::text
          from registrations r join tournaments t on t.id = r.tournament_id
         where t.director_id = p_director_id
           and r.status in ('registered','checked_in','substitute','no_show','disqualified')
           and r.partner_id is not null
        union
        select r.guest_player_id::text
          from registrations r join tournaments t on t.id = r.tournament_id
         where t.director_id = p_director_id
           and r.status in ('registered','checked_in','substitute','no_show','disqualified')
           and r.guest_player_id is not null
        union
        select r.guest_partner_id::text
          from registrations r join tournaments t on t.id = r.tournament_id
         where t.director_id = p_director_id
           and r.status in ('registered','checked_in','substitute','no_show','disqualified')
           and r.guest_partner_id is not null
      ) people
    ),
    (
      -- Deliberately NOT count(status = 'completed'). Nothing in the product
      -- ever writes that status: the enum has it, but the expiry job only
      -- moves open/filling_fast to registration_closed, and no app code sets
      -- it. Counting it would show 0 forever. A tournament is "hosted" once
      -- its date has passed and it was neither cancelled nor left in draft,
      -- which needs no new write path and grows on its own.
      --
      -- When a real completion transition exists (the reviews feature will
      -- need one, to know an event is over), this becomes
      -- `where status = 'completed'` and nothing else here changes.
      select count(*)::integer
        from tournaments t
       where t.director_id = p_director_id
         and t.event_date < current_date
         and t.status not in ('cancelled','draft')
    );
$$;

revoke all on function public.director_public_stats(uuid) from public;
grant execute on function public.director_public_stats(uuid) to authenticated, anon;

comment on function public.director_public_stats(uuid) is
  'Public director stats for the tournament detail strip. SECURITY DEFINER because registrations is RLS-protected; returns aggregates only, never PII.';
