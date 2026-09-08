-- Follow-up to 20260809123041_booking_engine_phase1_facility_foundation.sql:
-- facility_role_rank() was missing SET search_path, flagged by the Supabase
-- security advisor (function_search_path_mutable). Every other SQL function
-- in this migration already sets it; this one was an oversight. Matches the
-- convention used by is_admin()/is_facility_role_at_least()/etc.

CREATE OR REPLACE FUNCTION "public"."facility_role_rank"("p_role" "public"."facility_member_role")
  RETURNS smallint
  LANGUAGE "sql" IMMUTABLE
  SET "search_path" TO 'public'
  AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN 3
    WHEN 'manager' THEN 2
    WHEN 'staff' THEN 1
  END;
$$;
