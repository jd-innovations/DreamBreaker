-- Approving a court submission failed: 'type "geography" does not exist'
-- (2026-11-25, first real approval).
--
-- approve_facility_submission() runs with search_path = '' (the safe default
-- for SECURITY DEFINER). Its UPDATE/INSERT on facilities fires two trigger
-- functions that never pinned a search_path, so they inherited the empty one
-- and could not resolve unqualified PostGIS / unaccent names (both installed in
-- public):
--   fn_sync_facility_coords   -> ST_SetSRID / ST_MakePoint / geography
--   fn_generate_facility_slug -> unaccent
-- Fix at the source: pin each trigger function's own search_path, so it works
-- for every caller, not only this one.

alter function public.fn_sync_facility_coords() set search_path = public, pg_temp;
alter function public.fn_generate_facility_slug() set search_path = public, pg_temp;
