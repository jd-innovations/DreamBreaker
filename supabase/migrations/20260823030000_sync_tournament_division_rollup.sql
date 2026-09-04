-- ─────────────────────────────────────────────────────────────────────────────
-- Stop tournaments.formats / skill_min / skill_max from drifting.
--
-- These three columns are set when a tournament is created and never updated
-- when its divisions change, so they go stale. Measured on production before
-- this migration:
--
--   Test Small ❤️            formats []            divisions: mixed_doubles
--   Caledar Tournament Test  formats []            divisions: singles
--   Summer Slam Showdown     formats ["Mixed",…]   divisions: doubles, mixed_doubles
--   Suncoast classic sRQ     skill NULL            divisions: 3.50 – 4.00
--
-- Cards reading the columns therefore announced the wrong event — a
-- mixed-doubles tournament shown as "Doubles", a 3.5–4.0 event shown as
-- "0 – 0". Clients were being patched one surface at a time; this fixes the
-- data instead, so the columns become a cache derived from divisions rather
-- than independently-writable facts.
--
-- Two deliberate exceptions, both to avoid destroying director-entered data:
--
--   * A tournament with NO divisions is left alone. Lakewood Ranch Classic has
--     zero divisions and a real 3.00–5.00 range typed by its director; there is
--     nothing to derive from, and blanking it would lose the only signal there
--     is. Same reason the rollup does not clear values when the last division
--     is deleted.
--
--   * Skill is synced only when at least one division declares a range.
--     Divisions may legitimately carry no skill (Paddletek Classic today), and
--     a tournament-level range must not be wiped just because the divisions are
--     silent. Formats have no such ambiguity and are always synced.
--
-- SECURITY DEFINER is required, not decorative: "tournaments: director update
-- own" carries WITH CHECK (approved_at IS NULL), so a director adding a
-- division to an approved tournament could not update the parent row under
-- their own rights. tournaments has no FORCE ROW LEVEL SECURITY and is owned by
-- postgres, so the definer context bypasses RLS as intended.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."fn_sync_tournament_division_rollup"(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_division_count int;
  v_formats        text[];
  v_skill_min      numeric;
  v_skill_max      numeric;
begin
  if p_tournament_id is null then
    return;
  end if;

  select count(*) into v_division_count
    from divisions d
   where d.tournament_id = p_tournament_id;

  -- Nothing to derive from; keep whatever the director entered.
  if v_division_count = 0 then
    return;
  end if;

  select
      coalesce(array_agg(distinct d.format::text), '{}'::text[]),
      -- nullif(...,0): a 0 rating means "unset", not a real 0.0 skill level.
      min(nullif(d.skill_min, 0)),
      max(nullif(d.skill_max, 0))
    into v_formats, v_skill_min, v_skill_max
    from divisions d
   where d.tournament_id = p_tournament_id;

  update tournaments t
     set formats   = v_formats,
         skill_min = case when v_skill_min is not null then v_skill_min else t.skill_min end,
         skill_max = case when v_skill_max is not null then v_skill_max else t.skill_max end
   where t.id = p_tournament_id;
end;
$function$;

CREATE OR REPLACE FUNCTION "public"."fn_divisions_sync_tournament_rollup"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    perform fn_sync_tournament_division_rollup(old.tournament_id);
    return old;
  end if;

  perform fn_sync_tournament_division_rollup(new.tournament_id);

  -- A division moved between tournaments leaves the old parent stale too.
  if tg_op = 'UPDATE' and old.tournament_id is distinct from new.tournament_id then
    perform fn_sync_tournament_division_rollup(old.tournament_id);
  end if;

  return new;
end;
$function$;

DROP TRIGGER IF EXISTS "trg_divisions_sync_tournament_rollup" ON "public"."divisions";

CREATE TRIGGER "trg_divisions_sync_tournament_rollup"
AFTER INSERT OR UPDATE OR DELETE ON "public"."divisions"
FOR EACH ROW EXECUTE FUNCTION "public"."fn_divisions_sync_tournament_rollup"();

-- Neither function is meant to be called from a client. Postgres grants EXECUTE
-- to PUBLIC by default on new functions and anon inherits it, so revoke from
-- PUBLIC first — revoking from the role by name alone is a no-op (see
-- 20260821040000 and 20260823010000, which fixed exactly this).
REVOKE ALL ON FUNCTION "public"."fn_sync_tournament_division_rollup"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."fn_sync_tournament_division_rollup"(uuid) FROM anon;
REVOKE ALL ON FUNCTION "public"."fn_divisions_sync_tournament_rollup"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."fn_divisions_sync_tournament_rollup"() FROM anon;

-- One-time backfill for every tournament that already has divisions.
DO $backfill$
declare
  r record;
begin
  for r in select distinct tournament_id from divisions where tournament_id is not null loop
    perform fn_sync_tournament_division_rollup(r.tournament_id);
  end loop;
end;
$backfill$;
