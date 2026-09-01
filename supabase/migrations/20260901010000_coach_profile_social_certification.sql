-- Coach profile: social links and certification.
--
-- social_links is jsonb keyed by platform rather than one column per network,
-- for the same reason tournaments.amenities stores keys: the app owns the
-- platform catalogue (icon, label, URL template), so adding TikTok's
-- replacement later is a code change, not a migration, and an unknown key
-- written by a newer client is ignored by an older one instead of breaking it.
alter table public.profiles
  add column if not exists social_links jsonb not null default '{}'::jsonb;

-- Free text, not an enum: "PPR Certified", "PTR Professional", "IPTPA Level 2"
-- and every national body's wording. NOTHING verifies this — it is a claim the
-- coach types about themselves, which is exactly why the profile badge keys on
-- Stripe identity verification instead and its tooltip says verification
-- confirms identity, not credentials.
alter table public.profiles
  add column if not exists coach_certification text;

-- Guard rails rather than validation: an object (not an array or scalar) and a
-- bounded size, so this cannot become an unbounded blob on a publicly readable
-- row. A key-count check was dropped because Postgres rejects subqueries in
-- CHECK constraints and jsonb_object_keys is set-returning; the length bound
-- covers the same risk, and the app caps the list to its own catalogue.
alter table public.profiles
  drop constraint if exists profiles_social_links_shape;

alter table public.profiles
  add constraint profiles_social_links_shape
  check (
    jsonb_typeof(social_links) = 'object'
    and length(social_links::text) <= 2000
  );

alter table public.profiles
  drop constraint if exists profiles_coach_certification_len;

alter table public.profiles
  add constraint profiles_coach_certification_len
  check (coach_certification is null or length(coach_certification) <= 120);

-- profiles grants SELECT column by column, not table-wide: a new column is
-- invisible until granted, so omitting this would leave the coach profile
-- reading nothing with no error to explain why. Matches how bio/avatar_url are
-- exposed — anon can read them because the coach profile is meant to be public.
grant select (social_links, coach_certification) on public.profiles to anon, authenticated;
grant update (social_links, coach_certification) on public.profiles to authenticated;
grant insert (social_links, coach_certification) on public.profiles to authenticated;

comment on column public.profiles.social_links is
  'Public social links keyed by platform (instagram, facebook, tiktok, youtube, website, whatsapp, email). App owns the platform catalogue; unknown keys are ignored by clients.';
comment on column public.profiles.coach_certification is
  'Self-declared coaching credential. Unverified — the profile badge reflects Stripe identity verification, not this field.';
