-- Onboarding-to-Supabase wiring: adds the two profiles columns onboarding
-- collects that have no home today (gender, onboarding_intent), and extends
-- fn_handle_new_user() so a signup carrying onboarding data in
-- raw_user_meta_data gets it written to profiles atomically at account
-- creation — this is required for the email/password path, where
-- email-confirmation is enabled (see supabase/config.toml) and no client
-- session exists yet to make an authenticated profiles UPDATE.
--
-- The client (apps/mobile/src/lib/onboarding/finalize.ts) is the single
-- source of truth for translating onboarding option keys into valid column
-- values (e.g. skill_level's CHECK constraint, hand's CHECK constraint) —
-- this trigger only copies already-valid values through, it does not
-- re-implement that mapping in SQL.

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "gender" "text",
  ADD COLUMN IF NOT EXISTS "onboarding_intent" "text"[];

CREATE OR REPLACE FUNCTION "public"."fn_handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role        user_role;
  v_is_director boolean;
  v_meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  v_role        := coalesce((v_meta->>'role')::user_role, 'player');
  v_is_director := (v_role = 'director');

  insert into public.profiles (
    id, email, full_name, role, is_director, director_status,
    avatar_url, gender, hand, skill_level, play_style, availability,
    date_of_birth, home_court_id, location_city, location_state,
    location_lat, location_lng, story_radius_miles, onboarding_intent
  )
  values (
    new.id,
    new.email,
    coalesce(v_meta->>'full_name', split_part(new.email, '@', 1)),
    v_role,
    v_is_director,
    case when v_is_director then 'pending'::director_status else null end,
    coalesce(nullif(v_meta->>'avatar_url', ''), nullif(v_meta->>'picture', '')),
    nullif(v_meta->>'gender', ''),
    nullif(v_meta->>'hand', ''),
    nullif(v_meta->>'skill_level', ''),
    nullif(v_meta->>'play_style', ''),
    nullif(v_meta->>'availability', ''),
    nullif(v_meta->>'date_of_birth', '')::date,
    nullif(v_meta->>'home_court_id', '')::uuid,
    nullif(v_meta->>'location_city', ''),
    nullif(v_meta->>'location_state', ''),
    nullif(v_meta->>'location_lat', '')::double precision,
    nullif(v_meta->>'location_lng', '')::double precision,
    coalesce(nullif(v_meta->>'story_radius_miles', '')::integer, 25),
    case when v_meta ? 'onboarding_intent'
      then array(select jsonb_array_elements_text(v_meta->'onboarding_intent'))
      else null
    end
  );

  update public.play_participants
     set claimed_by = new.id
   where lower(email) = lower(new.email)
     and claimed_by is null;

  return new;
end;
$$;
