-- Signup has been returning HTTP 500 for every user since 2026-08-27.
--
-- profiles.play_style was reshaped from text to text[] (see
-- PLAY_STYLE_VOCABULARY.md — keys, not labels), but fn_handle_new_user, the
-- trigger that creates the profile row on auth.users insert, still passed:
--
--     nullif(v_meta->>'play_style', '')
--
-- `->>` yields text, the column is text[], and Postgres will not implicitly
-- cast between them:
--
--     ERROR: column "play_style" is of type text[] but expression is of
--     type text (SQLSTATE 42804)
--
-- This fails on EVERY signup, not only ones carrying play_style metadata:
-- plpgsql resolves the INSERT's column types when it plans the statement, so
-- the mismatch is a plan-time error and the value being null never comes into
-- it. The account is created in auth.users, the trigger aborts the
-- transaction, and the API returns 500.
--
-- Impact: the last account created was 2026-08-26. Zero signups in the 14 days
-- since — exactly the window this has been broken. Existing users were
-- unaffected; login, OAuth, refresh and every other auth path were fine, which
-- is why nothing else looked wrong.
--
-- The fix mirrors the onboarding_intent branch already sitting a few lines
-- below in the same function, but is deliberately more defensive: it accepts a
-- jsonb array (what the current client sends), tolerates a bare string (older
-- clients, and hand-set metadata), and otherwise stores null. Signup must not
-- be the place where a metadata shape mismatch takes the whole account down.
--
-- Everything else in the body is byte-for-byte the current definition.

create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    -- THE FIX. Array when the client sends one, single-element array when it
    -- sends a bare string, null otherwise.
    case
      when jsonb_typeof(v_meta->'play_style') = 'array'
        then array(select jsonb_array_elements_text(v_meta->'play_style'))
      when nullif(v_meta->>'play_style', '') is not null
        then array[v_meta->>'play_style']
      else null
    end,
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
$function$;

comment on function public.fn_handle_new_user() is
  'Creates the profiles row for a new auth.users record and claims any '
  'play_participants invited by that email. play_style is text[]: accepts a '
  'jsonb array, tolerates a bare string, else null (see 20260909235500 — a '
  'text/text[] mismatch here broke every signup for 14 days).';
