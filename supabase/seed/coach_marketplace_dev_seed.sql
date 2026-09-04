-- =============================================================================
-- Coach Marketplace V1 — Phase 2 DEVELOPMENT/TEST seed data
-- =============================================================================
-- Purpose: populate coaches + coach offers so the Phase 2 experience can be
-- visually reviewed in the running app. NOT a migration — mirrors the
-- top-level supabase/seed.sql convention (auth.users insert -> trigger
-- creates a base profiles row -> a follow-up UPDATE enriches it), scoped to
-- this feature so it can be rerun/reset independently.
--
-- Idempotent: every auth.users insert uses ON CONFLICT (id) DO NOTHING;
-- every coach_offers insert uses ON CONFLICT (id) DO NOTHING; profile
-- UPDATEs are naturally idempotent. Safe to run multiple times.
--
-- Identifiability: every seeded coach uses a fixed id in the
-- c0ac0000-0000-0000-0000-0000000000XX block (distinct from this project's
-- existing 00000000-.../11111111-... sample-data blocks) and an
-- @coach.dreambreaker.test email — both make this data trivially
-- distinguishable from real users and easy to bulk-select for reset.
--
-- Explicitly contains NO purchases, payments, PaymentIntents, vouchers, QR
-- credentials, redemptions, settlement/payout records, refunds, or disputes
-- — those domains don't exist yet (Phase 3+). Nothing here touches Stripe,
-- Court Booking inventory, or the facilities table (only references
-- existing facility ids as location metadata).
--
-- Run: paste into the Supabase SQL editor for this project, or ask the
-- assistant to re-apply it via the Supabase MCP execute_sql tool.
-- Reset: see coach_marketplace_dev_seed_reset.sql in this same directory.

-- =============================================================================
-- COACHES (13) — auth.users insert, trigger creates the base profiles row,
-- then a service_role-context UPDATE sets is_coach/coach_status (protected
-- columns, per trg_protect_coach_status_transitions) plus bio/location.
-- coach_status = 'test_ready': development fixture only, per the Phase 1
-- mechanism — never a substitute for real Stripe Connect readiness, and
-- structurally unreachable in production (see profiles.coach_status column
-- comment, 20260809150000 migration).
-- =============================================================================

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('c0ac0000-0000-0000-0000-000000000001', 'marisol.ibarra@coach.dreambreaker.test',   crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Marisol Ibarra",   "role": "player"}'::jsonb, now(), now()),
  ('c0ac0000-0000-0000-0000-000000000002', 'grant.okafor@coach.dreambreaker.test',     crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Grant Okafor",     "role": "player"}'::jsonb, now(), now()),
  ('c0ac0000-0000-0000-0000-000000000003', 'wren.delacroix@coach.dreambreaker.test',   crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Wren Delacroix",   "role": "player"}'::jsonb, now(), now()),
  ('c0ac0000-0000-0000-0000-000000000004', 'teddy.palomino@coach.dreambreaker.test',   crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Teddy Palomino",   "role": "player"}'::jsonb, now(), now()),
  ('c0ac0000-0000-0000-0000-000000000005', 'simone.achterberg@coach.dreambreaker.test',crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Simone Achterberg","role": "player"}'::jsonb, now(), now()),
  ('c0ac0000-0000-0000-0000-000000000006', 'julian.voss@coach.dreambreaker.test',      crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Julian Voss",      "role": "player"}'::jsonb, now(), now()),
  ('c0ac0000-0000-0000-0000-000000000007', 'odalys.ferreira@coach.dreambreaker.test',  crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Odalys Ferreira",  "role": "player"}'::jsonb, now(), now()),
  ('c0ac0000-0000-0000-0000-000000000008', 'casper.lindqvist@coach.dreambreaker.test', crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Casper Lindqvist", "role": "player"}'::jsonb, now(), now()),
  ('c0ac0000-0000-0000-0000-000000000009', 'renata.suarez@coach.dreambreaker.test',    crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Renata Suárez",    "role": "player"}'::jsonb, now(), now()),
  ('c0ac0000-0000-0000-0000-000000000010', 'theo.marchetti@coach.dreambreaker.test',   crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Theo Marchetti",   "role": "player"}'::jsonb, now(), now()),
  ('c0ac0000-0000-0000-0000-000000000011', 'ingrid.solberg@coach.dreambreaker.test',   crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Ingrid Solberg",   "role": "player"}'::jsonb, now(), now()),
  ('c0ac0000-0000-0000-0000-000000000012', 'desmond.achebe@coach.dreambreaker.test',   crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Desmond Achebe",   "role": "player"}'::jsonb, now(), now()),
  ('c0ac0000-0000-0000-0000-000000000013', 'faye.whitlock@coach.dreambreaker.test',    crypt('Password123!', gen_salt('bf')), now(), '{"full_name": "Faye Whitlock",    "role": "player"}'::jsonb, now(), now())
on conflict (id) do nothing;

do $$
begin
  set local request.jwt.claim.role = 'service_role';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Sarasota', location_state = 'FL', skill_level = '4.5+',
    bio = 'Former DI tennis player turned USAPA-certified pickleball coach. Obsessed with clean transition-zone footwork.'
  where id = 'c0ac0000-0000-0000-0000-000000000001';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Bradenton', location_state = 'FL', skill_level = '4.0-4.5',
    bio = 'Soft-game specialist who spent three years on the pro dinking circuit before moving to coaching full time.'
  where id = 'c0ac0000-0000-0000-0000-000000000002';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Sarasota', location_state = 'FL', skill_level = '4.5+',
    bio = '5.0-rated competitor and doubles strategist. Breaks down stacking, poaching, and communication for serious teams.'
  where id = 'c0ac0000-0000-0000-0000-000000000003';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Lakewood Ranch', location_state = 'FL', skill_level = '3.5-4.0',
    bio = 'Patient, encouraging instructor who has introduced more than 400 total beginners to the sport.'
  where id = 'c0ac0000-0000-0000-0000-000000000004';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Wilmington', location_state = 'DE', skill_level = '4.0-4.5',
    bio = 'Ex-college tennis coach who moved to pickleball for the shorter warmups and the better community.'
  where id = 'c0ac0000-0000-0000-0000-000000000005';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Newark', location_state = 'DE', skill_level = '4.5+',
    bio = 'Tournament veteran turned mental-game and match-prep coach for competitive players.'
  where id = 'c0ac0000-0000-0000-0000-000000000006';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Dover', location_state = 'DE', skill_level = '3.5-4.0',
    bio = 'High-energy group clinic leader — her Saturday clinics regularly sell out.'
  where id = 'c0ac0000-0000-0000-0000-000000000007';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Rehoboth Beach', location_state = 'DE', skill_level = '4.5+',
    bio = 'Former mini-tour player now focused exclusively on one-on-one private coaching.'
  where id = 'c0ac0000-0000-0000-0000-000000000008';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Bradenton', location_state = 'FL', skill_level = '3.0-3.5',
    bio = 'Runs family-friendly camps built around games, not just drilling.'
  where id = 'c0ac0000-0000-0000-0000-000000000009';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Sarasota', location_state = 'FL', skill_level = '4.5+',
    bio = 'Coaches advanced 4.0+ players on shot selection and pattern recognition.'
  where id = 'c0ac0000-0000-0000-0000-000000000010';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Ocean View', location_state = 'DE', skill_level = '3.5-4.0',
    bio = 'Runs women''s-focused clinics with an emphasis on confidence at the net.'
  where id = 'c0ac0000-0000-0000-0000-000000000011';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Newport', location_state = 'DE', skill_level = '3.0-3.5',
    bio = 'The most patient coach on this list — no question is a dumb question.'
  where id = 'c0ac0000-0000-0000-0000-000000000012';

  update public.profiles set is_coach = true, coach_status = 'test_ready',
    location_city = 'Nokomis', location_state = 'FL', skill_level = '4.0-4.5',
    bio = 'Third shot drop is her whole personality. Also good at everything else.'
  where id = 'c0ac0000-0000-0000-0000-000000000013';

  reset request.jwt.claim.role;
end $$;

-- =============================================================================
-- COACH OFFERS (30) — realistic mix of type/skill/price/inventory/status.
-- facility_id references EXISTING facilities.id rows only (location metadata
-- — never touches courts/ball_machines/booking inventory). All ACTIVE rows
-- satisfy the live coach_marketplace_min_discount_pct (20% at seed time);
-- the enforcement trigger (trg_enforce_coach_offer_publish_rules) verifies
-- this for real at insert time — it is not just asserted here.
--
-- Deliberate test case: offer .10 (Simone's semi-private) is DRAFT with an
-- 11%-off price, below the platform minimum — demonstrating that drafts are
-- exempt from the discount gate while publishing is not.
--
-- "Inventory conditions" (plenty/moderate/low/nearly-sold-out) are
-- represented by varying quantity_available itself, with
-- quantity_remaining always equal to it — there is no purchase history to
-- seed (explicitly out of scope), so nothing has actually depleted any
-- offer's inventory yet.
-- =============================================================================

insert into public.coach_offers (
  id, coach_id, offer_type, title, description, skill_level_label,
  duration_minutes, max_participants, lessons_included,
  regular_price_cents, discounted_price_cents,
  quantity_available, quantity_remaining, purchase_limit_per_customer,
  facility_id, status, premium_only, premium_price_cents, terms
) values
  -- Marisol Ibarra (transition zone) — Payne Park Pickleball Center, Sarasota FL
  ('33333333-3333-3333-3333-333333330001', 'c0ac0000-0000-0000-0000-000000000001', 'private', 'Transition Zone Mastery Session',
   'One-on-one work on footwork and shot selection through the no-volley-zone transition.', '3.5-4.0', 60, 1, null,
   9000, 6000, 10, 10, 2, 'b370f119-c3fb-4388-a0ef-e288ccb8c4b9', 'active', false, null,
   '24-hour cancellation notice required.'),
  ('33333333-3333-3333-3333-333333330002', 'c0ac0000-0000-0000-0000-000000000001', 'package', '5-Session Transition & Reset Package',
   'Five private sessions building a repeatable transition-zone and reset-shot routine.', '3.5-4.0+', 60, 1, 5,
   40000, 26000, 8, 8, 1, null, 'active', false, 23000,
   'Sessions must be used within the voucher''s validity window.'),

  -- Grant Okafor (soft game / dinking) — G.T. Bray Park Pickleball, Bradenton FL
  ('33333333-3333-3333-3333-333333330003', 'c0ac0000-0000-0000-0000-000000000002', 'semi_private', 'Dinking & Kitchen Control Duo Session',
   'Bring a partner for focused dinking-pattern and kitchen-control work.', '3.0-3.5', 60, 2, null,
   7000, 5000, 15, 15, 3, '6cce62ee-ab89-4956-95b1-a3ee64895525', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330004', 'c0ac0000-0000-0000-0000-000000000002', 'group_clinic', 'Soft Hands Saturday Clinic',
   'Small-group clinic focused entirely on touch, resets, and dinking consistency.', '2.5-3.0', 75, 8, null,
   4500, 3200, 8, 8, 1, '6cce62ee-ab89-4956-95b1-a3ee64895525', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330030', 'c0ac0000-0000-0000-0000-000000000002', 'private', 'One-on-One Soft Game Tune-Up',
   'A focused private session to clean up soft-game mechanics before tournament season.', '3.0-3.5', 45, 1, null,
   6000, 3800, 10, 10, null, null, 'draft', false, null, null),

  -- Wren Delacroix (doubles strategy) — Longwood Park Pickleball Courts, Sarasota FL
  ('33333333-3333-3333-3333-333333330005', 'c0ac0000-0000-0000-0000-000000000003', 'group_clinic', 'Stack & Poach Doubles Strategy Clinic',
   'Learn stacking, poaching, and on-court communication for competitive doubles.', '4.0+', 90, 6, null,
   6500, 4500, 6, 6, 1, 'cf4dbece-97f5-43c5-9545-e355bbbc7ebf', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330006', 'c0ac0000-0000-0000-0000-000000000003', 'camp', 'Competitive Doubles Weekend Intensive',
   'A weekend intensive covering strategy, drilling, and live competitive play.', '4.0+', 360, 12, null,
   22000, 15000, 12, 12, 1, 'cf4dbece-97f5-43c5-9545-e355bbbc7ebf', 'active', true, null,
   'Premium members only. Includes drilling packet and video review.'),
  ('33333333-3333-3333-3333-333333330029', 'c0ac0000-0000-0000-0000-000000000003', 'package', '4-Session Doubles Strategy Package',
   'Four sessions building a complete competitive doubles strategy toolkit.', '4.0+', 60, 2, 4,
   30000, 19500, 4, 4, 1, 'cf4dbece-97f5-43c5-9545-e355bbbc7ebf', 'active', false, null, null),

  -- Teddy Palomino (beginner fundamentals) — Lakewood Ranch Park Pickleball Courts, Bradenton FL
  ('33333333-3333-3333-3333-333333330007', 'c0ac0000-0000-0000-0000-000000000004', 'group_clinic', 'Absolute Beginner Fundamentals',
   'Rules, scoring, grip, and the basic shots — zero experience required.', 'Beginner', 90, 10, null,
   4000, 2800, 20, 20, null, '13bc7210-9d6c-40c7-a23a-01b6b3f6ae1e', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330008', 'c0ac0000-0000-0000-0000-000000000004', 'private', 'First Steps Private Intro',
   'A private, no-pressure introduction to the sport for total beginners.', 'Beginner', 45, 1, null,
   5500, 3800, 15, 15, 2, '13bc7210-9d6c-40c7-a23a-01b6b3f6ae1e', 'active', false, null, null),

  -- Simone Achterberg (serve & return) — Ace Pickleball Club, Wilmington DE
  ('33333333-3333-3333-3333-333333330009', 'c0ac0000-0000-0000-0000-000000000005', 'private', 'Serve & Return Precision Session',
   'Video-reviewed work on serve depth, spin, and return placement.', '3.5-4.0', 60, 1, null,
   8500, 5500, 10, 10, 2, '9d1a5371-47bc-46bf-b308-8bc4659d0db6', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330010', 'c0ac0000-0000-0000-0000-000000000005', 'semi_private', 'Two-Player Serve Lab',
   'Still finalizing pricing on this one before it goes live.', '3.5-4.0', 60, 2, null,
   6500, 5800, 3, 3, 1, '9d1a5371-47bc-46bf-b308-8bc4659d0db6', 'draft', false, null, null),

  -- Julian Voss (tournament prep) — Deacons Walk Pickleball Courts, Newark DE
  ('33333333-3333-3333-3333-333333330011', 'c0ac0000-0000-0000-0000-000000000006', 'private', 'Tournament Prep & Mental Game Session',
   'One-on-one tournament preparation covering strategy, routine, and mental game.', '4.0+', 60, 1, null,
   10000, 6500, 6, 6, 1, '57f2bbc8-d33b-4082-9e19-ca41948a25c7', 'active', true, null,
   'Premium members only.'),
  ('33333333-3333-3333-3333-333333330012', 'c0ac0000-0000-0000-0000-000000000006', 'package', '4-Session Tournament Ready Package',
   'Four sessions of targeted tournament preparation ahead of your next event.', '4.0+', 60, 1, 4,
   34000, 22000, 5, 5, 1, null, 'active', false, null, null),

  -- Odalys Ferreira (group clinics) — Courtside Pickleball & Tennis Club, Dover DE
  ('33333333-3333-3333-3333-333333330013', 'c0ac0000-0000-0000-0000-000000000007', 'group_clinic', 'Saturday Morning Movement Clinic',
   'A high-energy movement and footwork clinic to start your weekend right.', '3.0-3.5', 75, 10, null,
   4200, 3000, 20, 20, null, 'ab5d59d1-3202-4907-8ed4-01dc67069146', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330014', 'c0ac0000-0000-0000-0000-000000000007', 'group_clinic', 'Live-Ball Doubles Clinic',
   'Structured live-ball doubles points with coaching between rallies.', '3.5-4.0', 90, 8, null,
   5000, 3500, 8, 8, 2, 'ab5d59d1-3202-4907-8ed4-01dc67069146', 'active', false, null, null),

  -- Casper Lindqvist (private performance) — Abrams Pickleball Courts, Rehoboth Beach DE
  ('33333333-3333-3333-3333-333333330015', 'c0ac0000-0000-0000-0000-000000000008', 'private', 'Private Performance Session',
   'A focused 60-minute session tailored to your specific game.', '4.0+', 60, 1, null,
   11000, 7000, 5, 5, 1, '3f40398f-65ac-481c-92d9-3ee33139aeec', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330016', 'c0ac0000-0000-0000-0000-000000000008', 'private', 'Extended 90-Minute Performance Session',
   'A deeper 90-minute session for players preparing for a specific event.', '4.0+', 90, 1, null,
   15000, 9500, 1, 1, 1, '3f40398f-65ac-481c-92d9-3ee33139aeec', 'active', false, null, null),

  -- Renata Suárez (camps) — Manatee Avenue Pickleball Complex, Bradenton FL
  ('33333333-3333-3333-3333-333333330017', 'c0ac0000-0000-0000-0000-000000000009', 'camp', 'Family Fundamentals Weekend Camp',
   'A weekend camp built around games and team challenges the whole family can join.', 'All Levels', 240, 16, null,
   13000, 8500, 16, 16, 2, '05207016-3e46-4a88-a177-e13db44e37ba', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330018', 'c0ac0000-0000-0000-0000-000000000009', 'group_clinic', 'Kids & Teens Intro Clinic',
   'A fun, low-pressure introduction to pickleball for younger players.', 'Beginner', 60, 12, null,
   3500, 2500, 12, 12, null, '05207016-3e46-4a88-a177-e13db44e37ba', 'active', false, null, null),

  -- Theo Marchetti (advanced strategy) — Fruitville Park Pickleball/tennis, Sarasota FL
  ('33333333-3333-3333-3333-333333330019', 'c0ac0000-0000-0000-0000-000000000010', 'private', 'Advanced Shot Selection Session',
   'One-on-one work on shot selection and pattern recognition for 4.0+ players.', '4.0+', 60, 1, null,
   9500, 6200, 8, 8, 2, '4cad8cd9-8740-4952-87bd-08eb93b4aebd', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330020', 'c0ac0000-0000-0000-0000-000000000010', 'package', '3-Session Advanced Pattern Recognition Package',
   'Currently paused while the coach travels for the tournament circuit.', '4.0+', 60, 1, 3,
   26000, 17500, 6, 6, 1, '4cad8cd9-8740-4952-87bd-08eb93b4aebd', 'paused', false, null, null),

  -- Ingrid Solberg (women's clinics) — Bay Forest Tennis and Outdoor Pickleball Facility, Ocean View DE
  ('33333333-3333-3333-3333-333333330021', 'c0ac0000-0000-0000-0000-000000000011', 'group_clinic', 'Women''s Net Confidence Clinic',
   'A supportive clinic focused on building confidence at the non-volley line.', '3.0-3.5', 75, 10, null,
   4800, 3400, 10, 10, 2, '9362988e-629b-4e90-9b85-a4eb4d3f708f', 'paused', false, null, null),
  ('33333333-3333-3333-3333-333333330022', 'c0ac0000-0000-0000-0000-000000000011', 'semi_private', 'Women''s Doubles Duo Session',
   'Bring a partner for a session built around doubles positioning and communication.', '3.5-4.0', 60, 2, null,
   7000, 4800, 10, 10, 1, '9362988e-629b-4e90-9b85-a4eb4d3f708f', 'active', false, 4200, null),

  -- Desmond Achebe (all-levels, beginner-friendly) — Dill Dinkers Pickleball, Newport DE
  ('33333333-3333-3333-3333-333333330023', 'c0ac0000-0000-0000-0000-000000000012', 'private', 'No-Pressure Beginner Private Session',
   'A patient, judgment-free private session for brand-new players.', 'Beginner', 45, 1, null,
   5500, 3600, 20, 20, 3, 'c5a6ccd9-60f2-486f-9156-b5f1645e0f11', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330024', 'c0ac0000-0000-0000-0000-000000000012', 'group_clinic', 'All-Levels Open Play Clinic',
   'A relaxed, mixed-level clinic combining light instruction with open play.', 'All Levels', 90, 14, null,
   3800, 2700, 25, 25, null, 'c5a6ccd9-60f2-486f-9156-b5f1645e0f11', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330025', 'c0ac0000-0000-0000-0000-000000000012', 'package', '3-Lesson Confidence Builder Package',
   'Three beginner-focused sessions — still finalizing the exact curriculum.', 'Beginner', 45, 1, 3,
   15000, 9900, 10, 10, 1, 'c5a6ccd9-60f2-486f-9156-b5f1645e0f11', 'draft', false, null, null),

  -- Faye Whitlock (third shot drop) — Laurel Park Pickleball Courts, Nokomis FL
  ('33333333-3333-3333-3333-333333330026', 'c0ac0000-0000-0000-0000-000000000013', 'private', 'Third Shot Drop Deep Dive',
   'A full session dedicated entirely to a consistent, repeatable third shot drop.', '3.5-4.0', 60, 1, null,
   8000, 5400, 12, 12, 2, '4dbed7ef-00a1-4826-8dda-5c67bf5b72a7', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330027', 'c0ac0000-0000-0000-0000-000000000013', 'group_clinic', 'Kitchen Line Consistency Clinic',
   'Group clinic focused on consistent kitchen-line positioning and shot tolerance.', '3.0-3.5', 75, 8, null,
   4400, 3100, 8, 8, 1, '4dbed7ef-00a1-4826-8dda-5c67bf5b72a7', 'active', false, null, null),
  ('33333333-3333-3333-3333-333333330028', 'c0ac0000-0000-0000-0000-000000000013', 'camp', 'Third Shot & Transition Zone Camp',
   'A half-day camp combining drilling and live play around the transition zone.', '3.5-4.0', 300, 14, null,
   17500, 11500, 14, 14, 1, '4dbed7ef-00a1-4826-8dda-5c67bf5b72a7', 'active', false, null, null)
on conflict (id) do nothing;

-- No coach_offer_images rows are seeded — see the Phase 2 seed report for
-- why (avoids introducing a second/hotlinked image system; the app's empty
-- photo state renders correctly without them).
