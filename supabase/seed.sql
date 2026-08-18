-- =============================================================================
-- DreamBreaker PB — Development Seed Data
-- Run after migration: supabase db reset
-- Uses auth.users inserts valid only in local dev (Supabase CLI).
-- =============================================================================

-- NOTE: In production, users are created via Supabase Auth signup.
-- This seed creates users directly in auth.users for local dev testing only.

-- =============================================================================
-- AUTH USERS (local dev only — password: "Password123!")
-- =============================================================================

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  -- Admin
  ('00000000-0000-0000-0000-000000000001',
   'admin@dreambreaker.pb',
   crypt('Password123!', gen_salt('bf')),
   now(),
   '{"full_name": "Platform Admin", "role": "admin"}'::jsonb,
   now(), now()),

  -- Approved Director: Marco Velasquez
  ('00000000-0000-0000-0000-000000000002',
   'marco@dreambreaker.pb',
   crypt('Password123!', gen_salt('bf')),
   now(),
   '{"full_name": "Marco Velasquez", "role": "director"}'::jsonb,
   now(), now()),

  -- Pending Director: Reid Tanaka
  ('00000000-0000-0000-0000-000000000003',
   'reid@dreambreaker.pb',
   crypt('Password123!', gen_salt('bf')),
   now(),
   '{"full_name": "Reid Tanaka", "role": "director"}'::jsonb,
   now(), now()),

  -- Players
  ('00000000-0000-0000-0000-000000000004',
   'alex@dreambreaker.pb',
   crypt('Password123!', gen_salt('bf')),
   now(),
   '{"full_name": "Alex Morgan", "role": "player"}'::jsonb,
   now(), now()),

  ('00000000-0000-0000-0000-000000000005',
   'cassidy@dreambreaker.pb',
   crypt('Password123!', gen_salt('bf')),
   now(),
   '{"full_name": "Cassidy Rojas", "role": "player"}'::jsonb,
   now(), now()),

  ('00000000-0000-0000-0000-000000000006',
   'devon@dreambreaker.pb',
   crypt('Password123!', gen_salt('bf')),
   now(),
   '{"full_name": "Devon Mackay", "role": "player"}'::jsonb,
   now(), now())
on conflict (id) do nothing;

-- =============================================================================
-- PROFILE ENRICHMENT (trigger creates base profiles; this updates detail)
-- =============================================================================

update public.profiles set
  role                    = 'admin',
  director_status         = null
where id = '00000000-0000-0000-0000-000000000001';

update public.profiles set
  role                    = 'director',
  director_status         = 'approved',
  director_approved_at    = now() - interval '6 months',
  director_approved_by    = '00000000-0000-0000-0000-000000000001',
  director_rating         = 4.9,
  director_events_hosted  = 14,
  location_city           = 'Austin',
  location_state          = 'TX',
  location_coords         = st_point(-97.7431, 30.2672)
where id = '00000000-0000-0000-0000-000000000002';

update public.profiles set
  role                    = 'director',
  director_status         = 'pending',
  location_city           = 'Denver',
  location_state          = 'CO'
where id = '00000000-0000-0000-0000-000000000003';

update public.profiles set
  handle                  = '@alex.dinks',
  dupr                    = 4.18,
  dupr_verified           = true,
  location_city           = 'Austin',
  location_state          = 'TX',
  location_coords         = st_point(-97.7431, 30.2672),
  hand                    = 'right',
  paddle                  = 'Selkirk Power Air',
  play_style              = 'Soft-game / counter-puncher',
  availability            = 'Weekends + Tue evenings',
  bio                     = 'Competitive 4.2 doubles player. Soft game enthusiast, weekend warrior, Sunday brunch optional.'
where id = '00000000-0000-0000-0000-000000000004';

update public.profiles set
  handle                  = '@cassidy.dinks',
  dupr                    = 4.21,
  dupr_verified           = true,
  location_city           = 'Austin',
  location_state          = 'TX',
  location_coords         = st_point(-97.7270, 30.2888),
  hand                    = 'right',
  play_style              = 'Aggressive baseliner',
  availability            = 'Weekends + Tue evenings',
  bio                     = 'Former tennis collegiate. Hunting for a steady mixed doubles partner for the spring circuit.'
where id = '00000000-0000-0000-0000-000000000005';

update public.profiles set
  handle                  = '@devon.dinks',
  dupr                    = 4.55,
  dupr_verified           = true,
  location_city           = 'Round Rock',
  location_state          = 'TX',
  location_coords         = st_point(-97.6789, 30.5083),
  hand                    = 'left',
  play_style              = 'Soft-game specialist',
  availability            = 'Weeknights',
  bio                     = 'Lefty. Reliable third shot drop. Looking for a fast-handed partner for double elim brackets.'
where id = '00000000-0000-0000-0000-000000000006';

-- =============================================================================
-- TOURNAMENTS
-- =============================================================================

insert into public.tournaments (
  id, director_id, name, venue_name, venue_address, city, state,
  format, bracket_type, skill_min, skill_max, draw_size,
  entry_fee_cents, hold_fee_cents, hold_duration_hours, prize_pool_cents,
  event_date, registration_opens_at, registration_closes_at,
  checkin_opens_at, checkin_closes_at,
  status, spots_filled,
  approved_at, approved_by,
  description
) values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',  -- Marco
    'Sunset Slam Open',
    'Zilker Park Courts', '2100 Barton Springs Rd, Austin, TX 78746',
    'Austin', 'TX',
    'doubles', 'round_robin_to_single_elim', 3.5, 4.5, 64,
    6500, 1000, 72, 520000,
    '2026-03-14',
    '2025-12-01 00:00:00+00', '2026-03-07 23:59:59+00',
    '2026-03-14 06:30:00+00', '2026-03-14 07:30:00+00',
    'open', 41,
    now() - interval '2 months', '00000000-0000-0000-0000-000000000001',
    'The Sunset Slam Open is part of the Dream Breaker PB Pro Circuit. Doubles with players from across the region competing for $5,200 in cash + sponsor prizes.'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',  -- Marco
    'Lone Star Junior Cup',
    'DFW Pickle Arena', '1234 Sport Dr, Dallas, TX 75201',
    'Dallas', 'TX',
    'juniors', 'single_elim', null, null, 40,
    3000, 500, 72, 180000,
    '2026-05-22',
    '2026-02-01 00:00:00+00', '2026-05-15 23:59:59+00',
    '2026-05-22 07:00:00+00', '2026-05-22 08:00:00+00',
    'open', 8,
    now() - interval '1 month', '00000000-0000-0000-0000-000000000001',
    'U18 junior singles bracket. Great entry point for the next generation of PB talent.'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003',  -- Reid (pending — this tournament should be 'draft')
    'Mountain States Showdown',
    'Cherry Creek Pavilion', '4000 Cherry Creek Dr, Denver, CO 80246',
    'Denver', 'CO',
    'singles', 'single_elim', 3.0, 4.0, 32,
    5000, 1000, 72, 340000,
    '2026-04-19',
    '2026-01-15 00:00:00+00', '2026-04-12 23:59:59+00',
    null, null,
    'draft', 0,  -- Reid is pending director — tournament stays draft
    null, null,
    'Singles bracket for 3.0-4.0 players across the Rocky Mountain region.'
  )
on conflict (id) do nothing;

-- =============================================================================
-- DIVISIONS (for Sunset Slam Open)
-- =============================================================================

insert into public.divisions (id, tournament_id, name, format, skill_min, skill_max, draw_size)
values
  ('20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Mixed Doubles 3.5–4.5', 'mixed_doubles', 3.5, 4.5, 32),
  ('20000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   'Men''s Doubles 3.5–4.5', 'doubles', 3.5, 4.5, 32)
on conflict (id) do nothing;

-- =============================================================================
-- REGISTRATIONS
-- =============================================================================

insert into public.registrations (
  id, tournament_id, division_id, player_id, partner_id,
  status, hold_fee_paid_cents, entry_fee_paid_cents,
  hold_expires_at, waiver_accepted_at, director_added
) values
  -- Alex (registered, Men's Doubles with Devon as partner)
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000004',  -- Alex
    '00000000-0000-0000-0000-000000000006',  -- Devon
    'registered', 1000, 6500,
    null,  -- already confirmed, no expiry
    now() - interval '10 days',
    false
  ),
  -- Cassidy (spot held, Mixed Doubles, no partner yet)
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000005',  -- Cassidy
    null,
    'held', 1000, 0,
    now() + interval '48 hours',  -- hold expires in 48h
    null,
    false
  )
on conflict (id) do nothing;

-- =============================================================================
-- SAMPLE MATCHMAKING SWIPES (Alex likes Cassidy; Cassidy likes Alex = mutual match)
-- =============================================================================

insert into public.matchmaking_swipes (requester_id, target_id, direction)
values
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', 'like'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', 'like'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'pass')
on conflict (requester_id, target_id) do nothing;

-- =============================================================================
-- SAMPLE CONVERSATION (Alex + Cassidy matched)
-- =============================================================================

insert into public.conversations (id, participant_a, participant_b)
values (
  '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000004',  -- Alex
  '00000000-0000-0000-0000-000000000005'   -- Cassidy
) on conflict do nothing;

insert into public.messages (conversation_id, sender_id, body)
values
  ('40000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000004',
   'Hey Cassidy! Want to team up for the Sunset Slam mixed doubles?'),
  ('40000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000005',
   'Absolutely! I was going to message you. Let''s do it.')
on conflict do nothing;

-- =============================================================================
-- SAMPLE DUPR HISTORY
-- =============================================================================

insert into public.dupr_history (player_id, tournament_id, rating_before, rating_after)
values
  ('00000000-0000-0000-0000-000000000004', null, 4.06, 4.18),
  ('00000000-0000-0000-0000-000000000005', null, 4.10, 4.21)
on conflict do nothing;

-- =============================================================================
-- SAMPLE WALLET DATA (Alex Morgan)
-- =============================================================================

insert into public.wallet_partners (id, slug, name, description, logo_url, website_url)
values
  ('50000000-0000-0000-0000-000000000001', 'premium-membership', 'DreamBreaker PB',
   'DreamBreaker PB Premium membership.', null, null),
  ('50000000-0000-0000-0000-000000000002', 'pickleball-grip-doctor', 'Pickleball Grip Doctor',
   'Premium member merchandise credit.', null, 'https://pickleballgripdoctor.com'),
  ('50000000-0000-0000-0000-000000000003', 'selkirk-sport', 'Selkirk Sport',
   'Pickleball paddles and gear.', null, 'https://www.selkirk.com')
on conflict (slug) do nothing;

-- One placeholder wallet item per type category, so every dashboard section
-- has an example to preview.
insert into public.wallet_items (
  id, user_id, partner_id, type, status, title, subtitle, description,
  value_amount, currency_code, value_label, original_value_amount, remaining_value_amount,
  starts_at, expires_at, action_type, action_label, action_url,
  external_system, source_type, source_id, is_seen
)
values
  ('50000000-0000-0000-0000-000000000101',
   '00000000-0000-0000-0000-000000000004',
   '50000000-0000-0000-0000-000000000001',
   'membership', 'active', 'Premium Membership', 'Active',
   'Full access to premium tournament and marketplace features.',
   null, 'USD', null, null, null,
   now(), now() + interval '1 year',
   'view_details', null, null,
   null, 'seed', 'seed-premium-alex', false),
  ('50000000-0000-0000-0000-000000000102',
   '00000000-0000-0000-0000-000000000004',
   '50000000-0000-0000-0000-000000000002',
   'credit', 'processing', 'Pickleball Grip Doctor Annual Credit', 'Setting up your benefit',
   'Annual store credit for pickleball paddle grip replacement and accessories.',
   25.00, 'USD', '$25 Annual Credit', 25.00, 25.00,
   now(), now() + interval '1 year',
   'external_url', 'Shop Now', 'https://pickleballgripdoctor.com',
   'shopify', 'seed', 'seed-pgd-alex', false),
  ('50000000-0000-0000-0000-000000000104',
   '00000000-0000-0000-0000-000000000004',
   '50000000-0000-0000-0000-000000000003',
   'offer', 'available', '15% Off Selkirk Paddles', 'Selkirk Sport',
   'Save 15% on any Selkirk paddle. One-time use per member.',
   null, 'USD', '15% Off', null, null,
   now(), now() + interval '90 days',
   'external_url', 'Shop Now', 'https://www.selkirk.com',
   null, 'seed', 'seed-offer-alex', false),
  ('50000000-0000-0000-0000-000000000105',
   '00000000-0000-0000-0000-000000000004',
   '50000000-0000-0000-0000-000000000001',
   'pass', 'active', 'VIP Tournament Pass', 'Sarasota Open',
   'Priority check-in and reserved seating at Sarasota Open.',
   null, 'USD', null, null, null,
   now(), now() + interval '30 days',
   'view_details', null, null,
   null, 'seed', 'seed-pass-alex', false),
  ('50000000-0000-0000-0000-000000000106',
   '00000000-0000-0000-0000-000000000004',
   '50000000-0000-0000-0000-000000000001',
   'ticket', 'available', 'Sarasota Open Spectator Ticket', 'Sarasota Open',
   'General admission for one day at Sarasota Open.',
   null, 'USD', null, null, null,
   now(), now() + interval '45 days',
   'view_details', null, null,
   null, 'seed', 'seed-ticket-alex', false),
  ('50000000-0000-0000-0000-000000000107',
   '00000000-0000-0000-0000-000000000004',
   '50000000-0000-0000-0000-000000000001',
   'reward', 'available', 'Referral Reward', 'You earned a $10 credit',
   'Thanks for referring a friend to DreamBreaker PB — enjoy $10 toward your next entry fee.',
   10.00, 'USD', '$10 Credit', 10.00, 10.00,
   now(), now() + interval '180 days',
   'view_details', null, null,
   null, 'seed', 'seed-reward-alex', false)
on conflict do nothing;

insert into public.wallet_activity (wallet_item_id, user_id, event_type, title, description)
values
  ('50000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000004',
   'activated', 'Premium membership activated', 'Welcome to DreamBreaker PB Premium.'),
  ('50000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000004',
   'created', 'Credit added to your wallet', 'Your annual Grip Doctor credit is being set up.'),
  ('50000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000004',
   'created', 'Offer added to your wallet', 'Selkirk Sport 15% off unlocked.'),
  ('50000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000004',
   'activated', 'Pass activated', 'Your VIP pass for Sarasota Open is active.'),
  ('50000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000004',
   'created', 'Ticket added to your wallet', 'Spectator ticket for Sarasota Open added.'),
  ('50000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000004',
   'created', 'Reward earned', 'You earned a $10 referral credit.')
on conflict do nothing;
