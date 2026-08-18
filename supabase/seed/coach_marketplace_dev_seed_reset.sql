-- Removes everything created by coach_marketplace_dev_seed.sql. Safe to run
-- multiple times (each DELETE is naturally idempotent — no-op once empty).
-- Order matters: coach_offers has no ON DELETE CASCADE from profiles, so
-- offers must go first, then profiles, then auth.users (which DOES cascade
-- to profiles automatically via profiles_id_fkey, but we delete profiles
-- explicitly first anyway for clarity/symmetry with the seed script).

delete from public.coach_offer_images
where coach_offer_id in (
  select id from public.coach_offers
  where coach_id in (select id from public.profiles where email like '%@coach.dreambreaker.test')
);

delete from public.coach_offers
where coach_id in (select id from public.profiles where email like '%@coach.dreambreaker.test');

delete from public.profiles where email like '%@coach.dreambreaker.test';

delete from auth.users where email like '%@coach.dreambreaker.test';
