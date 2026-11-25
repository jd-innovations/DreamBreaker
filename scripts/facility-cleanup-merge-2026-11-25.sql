-- Facility cleanup, part 1: merge duplicate venues and delete non-venues.
-- Owner-approved 2026-11-25 ("1-16 yes, 17-21 yes except 19, delete yes").
--
-- For each (loser -> keeper): copy what the keeper lacks (court counts, phone,
-- website, hours, description, ZIP, Google place id), move every reference
-- (home courts, games, tournaments, sessions, listings, lessons, courts,
-- reservations, members, photos, applications, import rows, submissions) onto
-- the keeper, then delete the loser. All in one transaction: any error rolls
-- the whole thing back and nothing changes.

begin;

create temp table merge_map (loser uuid primary key, keeper uuid not null) on commit drop;
insert into merge_map (loser, keeper) values
  ('032a445f-3a98-44e7-9618-3f0a3f4f8a0a', '55d00100-5614-4304-bd49-d7c766c1f514'), -- 1  DIP Pickleball -> DFW Indoor Pickleball
  ('f499d149-e22c-4bd2-8f9c-fc2e3a4daf1a', '39aca947-8327-4cd4-ab6c-02000199dea1'), -- 2  G.T. Bray Recreation Center -> G.T. Bray Park
  ('13754796-8253-4f98-b288-4fab98df7398', '97f53024-167a-4f57-a00c-0744431a3092'), -- 3  Indoor Academy -> Sports at the Beach
  ('39b6c62f-5a57-43cd-8bb8-68a0ee2be737', '1ed67e42-f7e2-4748-8933-4ea9ad6e8a66'), -- 4  Sarasota Youth Pickleball League -> Sarasota Pompano Pickleball
  ('37fb2e35-01ac-42ff-b57e-a6644f9d67df', '1ed67e42-f7e2-4748-8933-4ea9ad6e8a66'), -- 4  Pompano Trailhead
  ('f5ea246d-460d-4a1e-b9eb-4957b80b3d60', '1ed67e42-f7e2-4748-8933-4ea9ad6e8a66'), -- 4  Sarasota Pickleball Club
  ('e48ce7df-59c2-427e-ae38-ad92b3d4f8c4', 'e2fcbb5a-8371-4749-8b75-29f1a8375baa'), -- 5  LWR G&CC Tennis Center -> LWR Golf & Country Club
  ('23d4d0a4-96bd-44b7-ab86-cc5ffa91e4da', 'e650b560-7671-41a2-b820-ae535991f1b0'), -- 6  Pickleball Courts -> River Strand Sanctuary Clubhouse
  ('c233b5c7-bbfe-4696-8b9d-7e55202f1a20', 'c5a6ccd9-60f2-486f-9156-b5f1645e0f11'), -- 7  Pro Shop -> Dill Dinkers Pickleball
  ('decf9ba0-09f6-491a-b4ae-0773bccb3825', 'ce2c432e-8f2c-4cc0-90ed-5bd446a0f205'), -- 8  Hockessin Recreation Center -> Hockessin PAL Center
  ('770d49f9-bc44-4665-b78d-8b1250a4a687', 'e9b0a219-1db9-4375-8ac5-6de6bdd1c2e8'), -- 9  ILA San Juan -> ILA San Juan Pickleball
  ('c4d797cc-4205-4af6-b147-f93caeb122cf', 'cf4dbece-97f5-43c5-9545-e355bbbc7ebf'), -- 10 Longwood Park -> Longwood Park Pickleball Courts
  ('0698cea9-bb89-44a8-80d1-5ef289729d83', 'a092694e-1931-4c2e-82d1-e07d80d93c3a'), -- 11 Rincón Club & League -> Rincón Pickleball Club
  ('e53a695a-022c-47fd-b32b-a0e42b9732e8', '5e111f53-9ece-4975-a96d-eebcff7f4101'), -- 12 Riviera (Bar & Grill) -> Riviera Tennis Center
  ('5262af15-2064-4786-8c7d-85d812b0fdaa', '8b17fa19-9a98-4b90-bf33-cd45a72c4afb'), -- 13 Pickleball court -> Chevy Chase Recreation Center
  ('2f23a9c6-a909-4c9f-bb06-a007cceb0927', '8b17fa19-9a98-4b90-bf33-cd45a72c4afb'), -- 13 Chevy Chase Playground
  ('63113917-a53b-4ae6-beb1-59b4eb9cf03e', 'dd9d05cf-906d-4ac0-a644-6d204f4ea159'), -- 14 DC Pickleball League -> Rock Creek Tennis Center
  ('9a8b38b8-a7cc-4352-a853-23faf3fbed15', '9c7f3cee-db05-4f37-8dce-00ecd432305a'), -- 15 Pickleball Courts -> Fretz Tennis & Pickleball Center
  ('53fa2cec-bff4-47a4-9927-c24e11772c62', '8727f683-2013-4d5b-92a5-e46a43e55ef8'), -- 16 Louis Font Mojica -> Luquillo Pickleball
  ('6f62f8ca-ab9d-449e-9ed8-c75cf675e0c8', 'dd9d05cf-906d-4ac0-a644-6d204f4ea159'), -- 17 Fitzgerald Tennis Center -> Rock Creek Tennis Center
  ('9e1b114e-aaf3-49d8-8375-83a0b346ad57', '0ef4d93a-913f-4742-ac4f-de5695c253bb'), -- 18 Samuell-Grand Rec Center -> Samuell Grand Tennis & Pickleball Center
  ('d6d37714-004d-4887-bcff-ba940a7aac2b', '7e277d55-fb64-4452-9958-9bcac1a2dba0'), -- 20 Rose Park Pickleball Court -> Rose Park Recreation Center
  ('31daf33f-7e81-4438-b7d4-a29006bb66a3', 'ac1fbaf5-5b54-4a2c-824b-4c0358cc9c29'); -- 21 Pickleball courts -> Takoma Recreation Center

-- 1. Fill gaps on the keeper from its duplicates (keeper's own values win).
update public.facilities k set
  court_count    = case when coalesce(k.court_count, 0) = 0 then coalesce(nullif(x.court_count, 0), k.court_count) else k.court_count end,
  indoor_courts  = case when coalesce(k.court_count, 0) = 0 and coalesce(x.court_count, 0) > 0 then x.indoor_courts else k.indoor_courts end,
  outdoor_courts = case when coalesce(k.court_count, 0) = 0 and coalesce(x.court_count, 0) > 0 then x.outdoor_courts else k.outdoor_courts end,
  phone          = coalesce(k.phone, x.phone),
  website        = coalesce(k.website, x.website),
  hours_summary  = coalesce(k.hours_summary, x.hours_summary),
  description    = coalesce(k.description, x.description),
  postal_code    = coalesce(k.postal_code, x.postal_code)
from (
  select distinct on (m.keeper) m.keeper, l.*
    from merge_map m join public.facilities l on l.id = m.loser
   order by m.keeper, coalesce(l.court_count, 0) desc
) x
where k.id = x.keeper;

-- Keep a Google place id so a future import still recognises the venue.
-- (Unique column: clear it on the loser first.)
create temp table moved_place_ids on commit drop as
  select distinct on (m.keeper) m.keeper, l.google_place_id
    from merge_map m join public.facilities l on l.id = m.loser
    join public.facilities k on k.id = m.keeper
   where l.google_place_id is not null and k.google_place_id is null
   order by m.keeper;
update public.facilities set google_place_id = null
 where id in (select loser from merge_map) and google_place_id in (select google_place_id from moved_place_ids);
update public.facilities k set google_place_id = p.google_place_id from moved_place_ids p where k.id = p.keeper;

-- 2. Move every reference onto the keeper.
update public.profiles                     t set home_court_id       = m.keeper from merge_map m where t.home_court_id       = m.loser;
update public.tournaments                  t set facility_id         = m.keeper from merge_map m where t.facility_id         = m.loser;
update public.play_events                  t set facility_id         = m.keeper from merge_map m where t.facility_id         = m.loser;
update public.personal_sessions            t set facility_id         = m.keeper from merge_map m where t.facility_id         = m.loser;
update public.marketplace_listings         t set pickup_facility_id  = m.keeper from merge_map m where t.pickup_facility_id  = m.loser;
update public.coach_offers                 t set facility_id         = m.keeper from merge_map m where t.facility_id         = m.loser;
update public.coach_offer_purchases        t set facility_id         = m.keeper from merge_map m where t.facility_id         = m.loser;
update public.courts                       t set facility_id         = m.keeper from merge_map m where t.facility_id         = m.loser;
update public.ball_machines                t set facility_id         = m.keeper from merge_map m where t.facility_id         = m.loser;
update public.reservations                 t set facility_id         = m.keeper from merge_map m where t.facility_id         = m.loser;
update public.reservation_check_ins        t set facility_id         = m.keeper from merge_map m where t.facility_id         = m.loser;
update public.facility_manager_applications t set facility_id        = m.keeper from merge_map m where t.facility_id         = m.loser;
update public.facility_manager_applications t set created_facility_id = m.keeper from merge_map m where t.created_facility_id = m.loser;
update public.facility_import_rows         t set matched_facility_id = m.keeper from merge_map m where t.matched_facility_id = m.loser;
update public.facility_import_rows         t set applied_facility_id = m.keeper from merge_map m where t.applied_facility_id = m.loser;
update public.facility_submissions         t set facility_id         = m.keeper from merge_map m where t.facility_id         = m.loser;
update public.facility_submissions         t set created_facility_id = m.keeper from merge_map m where t.created_facility_id = m.loser;
-- Photos move as extra (non-primary) photos; the keeper's cover stays.
update public.facility_photos              t set facility_id = m.keeper, is_primary = false from merge_map m where t.facility_id = m.loser;
-- Members: move, skipping anyone already on the keeper.
update public.facility_members t set facility_id = m.keeper
  from merge_map m
 where t.facility_id = m.loser
   and not exists (select 1 from public.facility_members e where e.facility_id = m.keeper and e.user_id = t.user_id);

-- 3. Delete the merged-away rows.
delete from public.facilities where id in (select loser from merge_map);

-- 4. Delete the three non-venues and the rental home's three copies.
--    None has a home court, game, session or listing pointing at it (checked 2026-11-25).
--    The import history still points at the rows it created; keep that history
--    but drop the link (first run failed on facility_import_rows_applied_facility_id_fkey).
update public.facility_import_rows set applied_facility_id = null where applied_facility_id in (
  '08825f61-2ba7-4d45-b906-ae17509ad497', '2edf4cb9-6216-4379-bf6e-981bd5a3f437', '3d89ca81-8d80-4594-bf08-289345e59bb0',
  'b9ba0056-863a-4710-932b-8975e5443b3d', '955044d6-07dd-4030-8dd6-fe35420a5e68');
update public.facility_import_rows set matched_facility_id = null where matched_facility_id in (
  '08825f61-2ba7-4d45-b906-ae17509ad497', '2edf4cb9-6216-4379-bf6e-981bd5a3f437', '3d89ca81-8d80-4594-bf08-289345e59bb0',
  'b9ba0056-863a-4710-932b-8975e5443b3d', '955044d6-07dd-4030-8dd6-fe35420a5e68');
delete from public.facilities where id in (
  '08825f61-2ba7-4d45-b906-ae17509ad497',  -- El Gremio (bar)
  '2edf4cb9-6216-4379-bf6e-981bd5a3f437',  -- BBB Sporting Goods
  '3d89ca81-8d80-4594-bf08-289345e59bb0',  -- Home with Pool Pickleball Court near El Yunque
  'b9ba0056-863a-4710-932b-8975e5443b3d',  -- (copy)
  '955044d6-07dd-4030-8dd6-fe35420a5e68'   -- (copy)
);

commit;
