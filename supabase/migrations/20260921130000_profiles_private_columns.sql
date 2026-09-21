-- Stop every signed-in user from reading every user's email and date of birth.
--
-- `profiles` RLS is "public read" with qual = true, and that is deliberate: the
-- partner finder, event rosters, group member lists and public profiles all
-- depend on reading other people's rows. Row access is not the problem.
--
-- Column grants are the only thing narrowing what comes back, and
-- `authenticated` held SELECT on every column — including `email` and
-- `date_of_birth`. Any signed-in user could page the table and harvest all 51
-- addresses. The `anon` half of this was closed on 2026-08-25
-- (20260825120000); the authenticated half was missed, and the user-directory
-- work would have turned a latent leak into a one-request export.
--
-- A column-level REVOKE cannot subtract from a table-level GRANT — it reports
-- success and does nothing. So the table grant is dropped and re-issued as an
-- explicit column list.
--
-- ⚠ CONSEQUENCE: profiles now uses a COLUMN-LEVEL grant. A future migration
-- that adds a column must grant it here too, or reads of that column will fail
-- for every signed-in user. A table-level grant covered new columns
-- automatically; this does not.

revoke select on public.profiles from authenticated;

grant select (
  id,
  full_name,
  handle,
  handle_changed_at,
  avatar_url,
  cover_url,
  bio,
  gender,
  hand,
  paddle,
  dupr,
  dupr_verified,
  self_rating,
  skill_level,
  play_style,
  play_intensity,
  preferred_formats,
  availability,
  availability_schedule,
  looking_status,
  is_discoverable,
  onboarding_intent,
  home_court_id,
  story_radius_miles,
  social_links,
  location_city,
  location_state,
  location_lat,
  location_lng,
  location_coords,
  role,
  is_director,
  director_status,
  director_approved_at,
  director_approved_by,
  director_events_hosted,
  director_rating,
  is_coach,
  coach_status,
  coach_certification,
  coach_commission_override_pct,
  marketplace_listing_limit,
  stripe_customer_id,
  stripe_connect_account_id,
  stripe_connect_onboarded_at,
  notif_messages,
  notif_tournaments,
  notif_new_match,
  notif_liked_you,
  notif_hold_expiry,
  notif_marketplace,
  notif_email_enabled,
  deleted_at,
  created_at,
  updated_at
) on public.profiles to authenticated;

-- ── The two legitimate readers, restored deliberately ───────────────────────

-- 1. The admin console lists users by email, searches by email, and picks
--    email-campaign recipients (web/src/app/admin/page.tsx, admin/wallet).
--
-- Returns ids and addresses only. The console already fetches the rest of each
-- profile through the ordinary grant and merges on id, so this exposes the one
-- withheld column and nothing else.
create or replace function public.admin_profile_emails()
returns table (id uuid, email text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.email
    from public.profiles p
   where public.is_admin();
$$;

revoke all on function public.admin_profile_emails() from public;
revoke all on function public.admin_profile_emails() from anon;
grant execute on function public.admin_profile_emails() to authenticated;

comment on function public.admin_profile_emails() is
  'Every profile id and email, for admins only. `email` is deliberately absent '
  'from the authenticated SELECT grant on profiles because RLS there permits '
  'reading every row. The is_admin() test is inside the query rather than '
  'guarding it, so a non-admin caller gets zero rows rather than an error.';

-- 2. The mobile match profile shows a player's AGE, computed from
--    date_of_birth (apps/mobile/src/app/match/profile/[id].tsx).
--
-- Age is the thing the product needs; an exact date of birth is
-- identity-document data. Returning the derived integer means the client never
-- receives the date at all — a strictly better outcome than the grant it
-- replaces, not merely an equivalent one.
create or replace function public.profile_age(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
           when p.date_of_birth is null then null
           else extract(year from age(p.date_of_birth))::integer
         end
    from public.profiles p
   where p.id = p_user_id;
$$;

revoke all on function public.profile_age(uuid) from public;
revoke all on function public.profile_age(uuid) from anon;
grant execute on function public.profile_age(uuid) to authenticated;

comment on function public.profile_age(uuid) is
  'A player''s age in whole years, or null. Exists so date_of_birth can stay '
  'out of the authenticated grant: the app only ever needed the age, and a '
  'birth date is identity-grade PII that no client should hold.';

-- 3. The wallet console looks a user up by email OR name
--    (web/src/app/admin/wallet/page.tsx).
--
-- A merge-on-id like (1) is not enough here: PostgREST cannot FILTER on a
-- column the caller cannot read, so the previous `.or(email.ilike...)` query
-- would fail outright rather than quietly omit the column. The search has to
-- move server-side with it.
create or replace function public.admin_search_profiles(p_query text, p_limit integer default 10)
returns table (id uuid, full_name text, email text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.full_name, p.email
    from public.profiles p
   where public.is_admin()
     and coalesce(trim(p_query), '') <> ''
     and (p.email ilike '%' || p_query || '%' or p.full_name ilike '%' || p_query || '%')
   order by p.full_name
   limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke all on function public.admin_search_profiles(text, integer) from public;
revoke all on function public.admin_search_profiles(text, integer) from anon;
grant execute on function public.admin_search_profiles(text, integer) to authenticated;

comment on function public.admin_search_profiles(text, integer) is
  'Admin-only profile lookup by email or name, for the wallet console. Needed because email left the authenticated SELECT grant: PostgREST cannot filter on a column the caller cannot read, so the previous .or(email.ilike) query would fail, not merely omit the column. The is_admin() test is inside the query, so a non-admin gets zero rows.';
