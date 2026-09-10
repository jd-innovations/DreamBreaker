-- fn_handle_new_user silently dropped three profile fields onboarding collects.
--
-- The trigger's INSERT names 20 columns. `preferred_formats`, `play_intensity`
-- and `self_rating` are not among them, so for any account created through the
-- SIGNUP path -- no session yet, fields riding in raw_user_meta_data -- those
-- three answers were discarded without error. The metadata carried them the
-- whole time (draftToProfileFields builds all three); nothing read them.
--
-- There is a natural experiment in production confirming it. Onboarding writes
-- the profile two different ways depending on whether a session exists
-- (finalizeOnboarding):
--
--   Jane Demo    onboarded while SIGNED IN  -> updateProfile() path
--                -> preferred_formats, play_intensity AND self_rating all set
--   John, Sam,   onboarded signed out       -> signUp metadata -> this trigger
--   AJ, Jimmy    -> all three null, every time
--
-- Same flow, same answers, different writer. Only the trigger loses them.
--
-- play_style is already handled here and is untouched: it was added by
-- 20260909235500 when a text/text[] mismatch on that column was 500ing every
-- signup. That fix corrected the column that was CRASHING; it did not audit the
-- ones that were merely missing.
--
-- Types, checked rather than assumed:
--   preferred_formats  text[]   -> same jsonb-array handling as play_style
--   play_intensity     text     -> plain, single-valued (the three values are
--                                  mutually exclusive; the UI enforces one)
--   self_rating        text     -> text, NOT numeric, despite holding "3.25"
--
-- Both array branches stay defensive in the same shape as play_style: accept a
-- jsonb array, tolerate a bare string, else null. Signup must not be where a
-- metadata shape mismatch takes the whole account down -- that is exactly what
-- 20260909235500 was written to stop.
--
-- No backfill. Existing rows were never asked these questions (the onboarding
-- screen offered no play_style keys at all until 2026-09-10), so there is
-- nothing to recover -- only guesses to avoid inventing.

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
    location_lat, location_lng, story_radius_miles, onboarding_intent,
    preferred_formats, play_intensity, self_rating
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
    end,
    -- NEW below. Same defensive shape as play_style above.
    case
      when jsonb_typeof(v_meta->'preferred_formats') = 'array'
        then array(select jsonb_array_elements_text(v_meta->'preferred_formats'))
      when nullif(v_meta->>'preferred_formats', '') is not null
        then array[v_meta->>'preferred_formats']
      else null
    end,
    nullif(v_meta->>'play_intensity', ''),
    nullif(v_meta->>'self_rating', '')
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
  'play_participants invited by that email. Writes the full onboarding payload '
  'from raw_user_meta_data, including play_style, preferred_formats, '
  'play_intensity and self_rating -- the last three were omitted until '
  '20260910010000 and were silently discarded on every signup-path account.';
