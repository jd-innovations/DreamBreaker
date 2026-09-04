-- =============================================================================
-- Stop anonymous clients reading personal data out of `profiles`
-- =============================================================================
-- Confirmed exploitable 2026-08-25 against production with nothing but the
-- publishable anon key, which ships inside every web bundle and every mobile
-- binary:
--
--   curl -H "apikey: <anon key>" \
--     '<project>.supabase.co/rest/v1/profiles?select=email,date_of_birth,location_lat,location_lng'
--
-- returned real user email addresses to an unauthenticated caller.
--
-- Cause: two independent things had to line up, and both did.
--   1. RLS policy `profiles: public read` has a USING clause of literally
--      `true` — every row is visible to everyone. That is intentional; profiles
--      are a discovery surface.
--   2. `anon` holds **table-level** SELECT on `profiles` (Supabase's default
--      `GRANT ALL ON ALL TABLES IN SCHEMA public`), so "every row" also meant
--      every *column* — email, date_of_birth, precise home coordinates, Stripe
--      identifiers, notification preferences.
--
-- Item 2.2's RLS matrix passed because it tested which *rows* each role can
-- see. This is a column-grant problem, which that suite does not model.
--
-- Fix: a column-level SELECT grant cannot be carved out of a table-level one —
-- the table grant has to go first, then the safe columns are granted back.
--
-- `authenticated` is deliberately NOT changed here. The mobile partner finder
-- legitimately reads other users' `date_of_birth` (age) and `location_lat/lng`
-- (distance), so narrowing that role needs a restricted view and app changes,
-- and app changes need an EAS build. That is a separate, planned follow-up;
-- signed-in users can still read every column today. This migration closes the
-- unauthenticated hole only, and needs no client change at all.
-- =============================================================================

begin;

revoke select on public.profiles from anon;

-- Public discovery surface: what a logged-out visitor may see on a public
-- profile, a tournament's director block, or a shared event page.
--
-- Anything NOT listed is now unreadable to `anon`. Deliberately excluded:
--   email, date_of_birth, gender          personal identity
--   location_lat, location_lng,
--     location_coords                     precise home location
--   stripe_customer_id,
--     stripe_connect_account_id,
--     stripe_connect_onboarded_at         payment identifiers
--   coach_commission_override_pct,
--     marketplace_listing_limit           commercial terms
--   notif_*, availability_schedule        private preferences
--   deleted_at, director_approved_by      internal metadata
grant select (
  id, role, full_name, handle, avatar_url,
  location_city, location_state,
  dupr, dupr_verified, self_rating, skill_level,
  paddle, hand, play_style, availability, bio,
  cover_url, is_discoverable, looking_status,
  is_director, director_status, director_approved_at,
  director_rating, director_events_hosted,
  is_coach, coach_status,
  home_court_id, story_radius_miles, onboarding_intent,
  created_at, updated_at
) on public.profiles to anon;

commit;

-- ─── Verification ────────────────────────────────────────────────────────────
--
-- Re-run the curl above. It must now fail with 42501 (permission denied for
-- column email) instead of returning rows.
--
-- These must still succeed anonymously, because they are what logged-out
-- visitors actually load:
--
--   /rest/v1/profiles?select=id,full_name,avatar_url,dupr,skill_level&limit=1
--   /rest/v1/profiles?select=id,full_name,director_events_hosted,director_rating&limit=1
--
-- Checked before writing this: no anonymous web surface selects an excluded
-- column. web/src/app/profile/[id] reads
-- id,full_name,handle,dupr,skill_level,location_city,location_state,avatar_url,
-- bio,play_style,role,director_status — all still granted. Every query that
-- does read email (admin console, Stripe Connect start, the mobile join flow)
-- runs authenticated, and `authenticated` is untouched.
