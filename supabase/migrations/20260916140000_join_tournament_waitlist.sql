-- A3 of WEB_MOBILE_ALIGNMENT_PLAN.md: waitlist position, decided server-side.
--
-- Web computed the next position in the BROWSER:
--
--   select waitlist_position ... order by desc limit 1   -- read
--   nextPos = (last ?? 0) + 1                            -- compute
--   insert ... waitlist_position: nextPos                -- write
--
-- Three round trips with no lock between them, so two people tapping "Join
-- waitlist" within the same second both read the same maximum and both insert
-- the same position. Nothing detected it: the index on
-- (tournament_id, waitlist_position) was NOT unique, so the duplicate was
-- accepted and promote_next_waitlisted() then ordered two people identically
-- and picked whichever the planner happened to return first.
--
-- Latent in the data today -- zero rows carry a position -- but the code path
-- is live on production, and a waitlist race is exactly the kind of bug that
-- only appears when a tournament is popular enough for it to matter.
--
-- TWO defences, deliberately, because they fail differently:
--
--   1. The function serialises joins per tournament, so the normal path never
--      produces a collision.
--   2. A partial UNIQUE index makes a duplicate position unrepresentable, so
--      any future path that bypasses the function fails loudly instead of
--      silently corrupting the order.
--
-- Position is TOURNAMENT-wide, not per division. That is not a choice made
-- here -- promote_next_waitlisted() already orders by
-- `waitlist_position NULLS LAST, created_at` scoped to tournament_id alone, so
-- a per-division numbering would be read by the promoter as one interleaved
-- sequence and produce an order nobody intended.

-- ── Make a duplicate position impossible ────────────────────────────────────
-- Partial, matching the existing non-unique index's predicate: a withdrawn or
-- promoted registration keeps its old number as history, and only rows still
-- ON the waitlist compete for a position.

create unique index if not exists uq_registrations_waitlist_position
  on public.registrations (tournament_id, waitlist_position)
  where status = any (array['waitlisted', 'waitlist_offered']::registration_status[])
    and waitlist_position is not null;

comment on index public.uq_registrations_waitlist_position is
  'Two people cannot hold the same waitlist position in one tournament. The non-unique idx_registrations_waitlist remains for lookups.';

-- ── The one way to join ─────────────────────────────────────────────────────

create or replace function public.join_tournament_waitlist(
  p_tournament_id uuid,
  p_division_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user     uuid := auth.uid();
  v_status   text;
  v_existing public.registrations;
  v_pos      integer;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select t.status::text into v_status
    from public.tournaments t where t.id = p_tournament_id;

  if not found then
    raise exception 'tournament_not_found' using errcode = 'P0001';
  end if;

  -- A waitlist for a finished or cancelled tournament is a queue for nothing.
  -- Draft is excluded too: it is not public yet, so nobody should be able to
  -- queue for it by calling this directly.
  if v_status in ('completed', 'cancelled', 'draft') then
    raise exception 'tournament_not_accepting' using errcode = 'P0001',
      hint = 'This tournament is not accepting waitlist entries.';
  end if;

  -- Idempotent, and it must be: the button can be double-tapped, and the old
  -- client reported a position from its own optimistic computation. Returning
  -- the REAL position also repairs a client that showed a stale one.
  select * into v_existing
    from public.registrations r
   where r.tournament_id = p_tournament_id
     and r.player_id = v_user
     and r.status = any (array['waitlisted', 'waitlist_offered']::registration_status[]);

  if found then
    return jsonb_build_object(
      'ok', true, 'reason', 'already_waitlisted',
      'position', v_existing.waitlist_position,
      'registration_id', v_existing.id
    );
  end if;

  -- Someone holding a spot or already registered does not belong in the queue.
  select * into v_existing
    from public.registrations r
   where r.tournament_id = p_tournament_id
     and r.player_id = v_user
     and r.status = any (array['held', 'registered', 'checked_in', 'substitute']::registration_status[]);

  if found then
    raise exception 'already_registered' using errcode = 'P0001',
      hint = 'You already have a place in this tournament.';
  end if;

  -- THE FIX. A transaction-scoped advisory lock keyed on the tournament, so
  -- concurrent joins queue up here instead of racing between the read and the
  -- write. Released automatically at commit or rollback -- there is no unlock
  -- to forget.
  --
  -- Two-argument form so the key space is namespaced: a single bigint derived
  -- from a uuid could collide with an unrelated advisory lock elsewhere in the
  -- application and serialise two things that have nothing to do with each
  -- other.
  --
  -- An advisory lock rather than locking the rows: there may be no rows yet
  -- (the first joiner has nothing to lock), which is precisely the case a
  -- SELECT ... FOR UPDATE cannot cover.
  -- No casts: the TWO-argument form is (int4, int4), and hashtext() already
  -- returns integer. Casting to bigint selects the one-argument signature,
  -- which does not exist with two parameters and fails at runtime, not at
  -- create time -- the function compiled fine and threw on first call.
  perform pg_advisory_xact_lock(
    hashtext('tournament_waitlist'),
    hashtext(p_tournament_id::text)
  );

  select coalesce(max(r.waitlist_position), 0) + 1 into v_pos
    from public.registrations r
   where r.tournament_id = p_tournament_id
     and r.status = any (array['waitlisted', 'waitlist_offered']::registration_status[]);

  insert into public.registrations (
    tournament_id, player_id, division_id, status, waitlist_position
  ) values (
    p_tournament_id, v_user, p_division_id, 'waitlisted', v_pos
  )
  returning * into v_existing;

  return jsonb_build_object(
    'ok', true, 'position', v_pos, 'registration_id', v_existing.id
  );
end;
$function$;

revoke execute on function public.join_tournament_waitlist(uuid, uuid) from public, anon;
-- `authenticated`, not service_role: auth.uid() is NULL under a service-role
-- client, and this function's whole identity model is the caller's own id.
grant  execute on function public.join_tournament_waitlist(uuid, uuid) to authenticated;

comment on function public.join_tournament_waitlist(uuid, uuid) is
  'The only way to join a tournament waitlist. Serialises position assignment per tournament with an advisory lock, is idempotent for a caller already queued, and refuses someone who already holds a place.';
