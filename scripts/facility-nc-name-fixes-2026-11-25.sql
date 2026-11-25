-- NC Discover import (154 venues, 2026-11-25): fix Google picks that named the
-- courts after a neighbouring business, plus two junk city values.
-- Renames only; every row keeps its courts, address and slug. Each update is
-- guarded by the current name, so re-running is harmless.
begin;

update public.facilities set name = 'Lake Junaluska Pickleball Courts'
 where id::text like 'c698fb2a%' and name = 'Lake Junaluska Boat Ramp';
update public.facilities set name = 'Pickleball Courts – Duck Road, Kitty Hawk', website = null
 where id::text like 'e463c1c9%' and name = 'Outer Banks Paddleboard';
update public.facilities set name = 'Pickleball Courts – East Main Street, Thomasville'
 where id::text like '65511ab6%' and name = 'Squash court';
update public.facilities set name = 'Rec Acres Park'
 where id::text like 'ab4bcfb4%' and name = 'Rec Aces Disc Golf Course';
update public.facilities set name = 'Fontana Village Resort'
 where id::text like '984755aa%' and name = 'Fontana Disc Golf Resort';
update public.facilities set name = 'Pickleball Courts – Club Drive, Stanley'
 where id::text like '3b569dac%' and name = 'Cowan''s Ford Fighting Crabs Swim Team';
update public.facilities set name = 'Sedgefield Tennis Courts'
 where id::text like '15707ba8%' and name = 'Sedgefield Tennis Pro Shop';
update public.facilities set name = 'Pickleball Courts – Highway 12, Buxton'
 where id::text like '42dede36%' and name = 'Dare County Parks & Recreation';
update public.facilities set name = 'Smithville Park Pickleball Courts', city = 'Boiling Spring Lakes', address = 'Smithville Park'
 where id::text like '1ff54466%' and name = 'Smithville Park Pickleball (4)';
update public.facilities set name = 'Middleton Park Pickleball Courts'
 where id::text like 'b73b25a2%' and name = 'Middleton Park Pickleball (12)';
update public.facilities set city = 'Corolla'
 where id::text like '8f358760%' and city = 'Unknown';

commit;
