-- Adds primary-photo ingestion to admin_commit_facility_import.
--
-- Originally deliberately out of scope ("keep photo ingestion separate from
-- the initial facility import" — see 20260908010000's header). Revisited
-- 2026-09-08 after the first real production run (9 Wilmington, DE
-- facilities) surfaced that facilities imported without this had no image at
-- all in the app. Scope stays narrow: the PRIMARY photo only, same as
-- scripts/import-facilities-csv.mjs's own photo handling — this is not a
-- gallery importer, on either path.
--
-- web/src/lib/facilityImport.ts now extracts the primary photo's Google
-- Places resource name from the CSV's `photos` column (same JSON shape and
-- extraction logic as the CLI script) and builds the same facility-photo
-- proxy URL. This function upserts exactly one facility_photos row per
-- facility, using the same (facility_id, google_photo_name) unique index
-- the CLI script's generated SQL already relies on
-- (uq_facility_photos_google_name), so re-running an import with a refreshed
-- photo reference updates the existing row instead of duplicating it.
--
-- Whether the photo actually LOADS in the app depends on the facility-photo
-- edge function and the underlying Google Places API key being healthy —
-- unrelated to this migration, and was independently broken at the time this
-- was written (every facility-photo request was returning 502, not just
-- these). This function stores the correct URL either way; nothing here can
-- fix or break that separately.

create or replace function public.admin_commit_facility_import(
  p_batch_id uuid,
  p_admin_id uuid,
  p_decisions jsonb default '{}'::jsonb
) returns table (applied_count int, skipped_count int, error_count int)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row record;
  v_m jsonb;
  v_decision text;
  v_action text;
  v_facility_id uuid;
  v_applied int := 0;
  v_skipped int := 0;
  v_errored int := 0;

  -- Extracted mapped fields, re-used by both the insert and update branches.
  v_name text; v_slug text; v_facility_type text;
  v_address text; v_address_line_2 text; v_city text; v_state text; v_postal_code text; v_country text;
  v_lat numeric; v_lng numeric; v_phone text; v_website text; v_google_maps_uri text; v_description text;
  v_court_count int; v_indoor_courts int; v_outdoor_courts int; v_surface_type text;
  v_lighting boolean; v_restrooms boolean; v_water boolean; v_parking boolean;
  v_pro_shop boolean; v_lessons_available boolean; v_open_play_available boolean; v_reservation_required boolean;
  v_public_access boolean; v_membership_required boolean; v_bookable_by_public boolean; v_booking_url text;
  v_fee_type text; v_typical_fee text; v_hours_summary text;
  v_skill_levels text[]; v_amenities text[]; v_tags text[]; v_google_types text[];
  v_status text; v_data_confidence int; v_last_verified_date timestamptz; v_notes text;
  v_price_level int; v_wheelchair_accessible boolean; v_google_rating numeric; v_google_rating_count int;
  v_business_status text; v_gpid text; v_data_source text;
  v_photo_url text; v_photo_name text;
begin
  -- Deliberately no is_admin() check here: a service-role session has no
  -- auth.uid(), so is_admin() (which reads profiles where id = auth.uid())
  -- would always be false. Trust is established once, upstream, by
  -- admin-facility-import-commit verifying the caller's own JWT and passing
  -- p_admin_id explicitly — this function must never be reachable any other
  -- way, which is why EXECUTE is revoked from every role except service_role
  -- below.

  for v_row in
    select r.* from public.facility_import_rows r
    where r.batch_id = p_batch_id and r.applied = false
    order by r.row_number
  loop
    if v_row.match_type = 'invalid' then
      continue;
    end if;

    v_decision := p_decisions ->> v_row.id::text;
    if v_decision is null then
      v_action := case v_row.match_type
        when 'confident' then 'approve_update'
        when 'new' then 'create_new'
        else 'skip' -- 'possible' with no explicit decision
      end;
    else
      v_action := v_decision;
    end if;

    if v_action = 'skip' or (v_action = 'approve_update' and v_row.matched_facility_id is null) then
      v_skipped := v_skipped + 1;
      update public.facility_import_rows set admin_decision = 'skip' where id = v_row.id;
      continue;
    end if;

    v_m := v_row.mapped;
    begin
      v_name := nullif(trim(v_m ->> 'name'), '');
      v_slug := nullif(trim(v_m ->> 'slug'), '');
      v_facility_type := nullif(trim(v_m ->> 'facility_type'), '');
      v_address := nullif(trim(v_m ->> 'address'), '');
      v_address_line_2 := nullif(trim(v_m ->> 'address_line_2'), '');
      v_city := nullif(trim(v_m ->> 'city'), '');
      v_state := nullif(trim(v_m ->> 'state'), '');
      v_postal_code := nullif(trim(v_m ->> 'postal_code'), '');
      v_country := coalesce(nullif(trim(v_m ->> 'country'), ''), 'US');
      v_lat := (v_m ->> 'latitude')::numeric;
      v_lng := (v_m ->> 'longitude')::numeric;
      v_phone := nullif(trim(v_m ->> 'phone'), '');
      v_website := nullif(trim(v_m ->> 'website'), '');
      v_google_maps_uri := nullif(trim(v_m ->> 'google_maps_uri'), '');
      v_description := nullif(trim(v_m ->> 'description'), '');
      v_court_count := coalesce(nullif(v_m ->> 'court_count', '')::int, 0);
      v_indoor_courts := coalesce(nullif(v_m ->> 'indoor_courts', '')::int, 0);
      v_outdoor_courts := coalesce(nullif(v_m ->> 'outdoor_courts', '')::int, 0);
      v_surface_type := nullif(trim(v_m ->> 'surface_type'), '');
      v_lighting := coalesce((v_m ->> 'lighting')::boolean, false);
      v_restrooms := coalesce((v_m ->> 'restrooms')::boolean, false);
      v_water := coalesce((v_m ->> 'water')::boolean, false);
      v_parking := coalesce((v_m ->> 'parking')::boolean, false);
      v_pro_shop := coalesce((v_m ->> 'pro_shop')::boolean, false);
      v_lessons_available := coalesce((v_m ->> 'lessons_available')::boolean, false);
      v_open_play_available := coalesce((v_m ->> 'open_play_available')::boolean, false);
      v_reservation_required := coalesce((v_m ->> 'reservation_required')::boolean, false);
      v_public_access := coalesce((v_m ->> 'public_access')::boolean, true);
      v_membership_required := coalesce((v_m ->> 'membership_required')::boolean, false);
      v_bookable_by_public := coalesce((v_m ->> 'bookable_by_public')::boolean, false);
      v_booking_url := nullif(trim(v_m ->> 'booking_url'), '');
      v_fee_type := nullif(trim(v_m ->> 'fee_type'), '');
      v_typical_fee := nullif(trim(v_m ->> 'typical_fee'), '');
      v_hours_summary := nullif(trim(v_m ->> 'hours_summary'), '');
      select coalesce(array_agg(x), '{}') into v_skill_levels from jsonb_array_elements_text(coalesce(v_m -> 'skill_levels', '[]'::jsonb)) x;
      select coalesce(array_agg(x), '{}') into v_amenities from jsonb_array_elements_text(coalesce(v_m -> 'amenities', '[]'::jsonb)) x;
      select coalesce(array_agg(x), '{}') into v_tags from jsonb_array_elements_text(coalesce(v_m -> 'tags', '[]'::jsonb)) x;
      select coalesce(array_agg(x), '{}') into v_google_types from jsonb_array_elements_text(coalesce(v_m -> 'google_types', '[]'::jsonb)) x;
      v_status := nullif(trim(v_m ->> 'status'), '');
      v_data_confidence := nullif(v_m ->> 'data_confidence', '')::int;
      v_last_verified_date := nullif(v_m ->> 'last_verified_date', '')::timestamptz;
      v_notes := nullif(trim(v_m ->> 'notes'), '');
      v_price_level := nullif(v_m ->> 'price_level', '')::int;
      v_wheelchair_accessible := (v_m ->> 'wheelchair_accessible')::boolean;
      v_google_rating := nullif(v_m ->> 'google_rating', '')::numeric;
      v_google_rating_count := nullif(v_m ->> 'google_rating_count', '')::int;
      v_business_status := nullif(trim(v_m ->> 'business_status'), '');
      v_gpid := nullif(trim(v_m ->> 'google_place_id'), '');
      v_data_source := coalesce(nullif(trim(v_m ->> 'data_source'), ''), 'csv_import');
      v_photo_url := nullif(trim(v_m ->> 'photo_url'), '');
      v_photo_name := nullif(trim(v_m ->> 'photo_google_name'), '');
    exception when others then
      v_errored := v_errored + 1;
      update public.facility_import_rows
        set apply_error = 'field parse error: ' || sqlerrm, admin_decision = coalesce(v_decision, v_action)
      where id = v_row.id;
      continue;
    end;

    -- check_court_subtotals: indoor+outdoor <= court_count.
    v_court_count := greatest(v_court_count, v_indoor_courts + v_outdoor_courts);

    begin
      if v_action = 'create_new' then
        insert into public.facilities (
          name, slug, facility_type, address, address_line_2, city, state, postal_code, country,
          latitude, longitude, phone, website, google_maps_uri, description,
          court_count, indoor_courts, outdoor_courts, surface_type,
          lighting, restrooms, water, parking, pro_shop, lessons_available, open_play_available,
          reservation_required, public_access, membership_required, bookable_by_public, booking_url,
          fee_type, typical_fee, hours_summary, skill_levels, amenities, tags,
          status, data_confidence, last_verified_date, notes,
          price_level, wheelchair_accessible, google_rating, google_rating_count, google_types, business_status,
          google_place_id, data_source, source_url,
          verified, claim_status, owner_user_id, created_by, import_batch_id
        ) values (
          v_name, v_slug, v_facility_type, v_address, v_address_line_2, v_city, v_state, v_postal_code, v_country,
          v_lat, v_lng, v_phone, v_website, v_google_maps_uri, v_description,
          v_court_count, v_indoor_courts, v_outdoor_courts, v_surface_type,
          v_lighting, v_restrooms, v_water, v_parking, v_pro_shop, v_lessons_available, v_open_play_available,
          v_reservation_required, v_public_access, v_membership_required, v_bookable_by_public, v_booking_url,
          v_fee_type, v_typical_fee, v_hours_summary, v_skill_levels, v_amenities, v_tags,
          v_status, v_data_confidence, v_last_verified_date, v_notes,
          v_price_level, v_wheelchair_accessible, v_google_rating, v_google_rating_count, v_google_types, v_business_status,
          v_gpid, v_data_source, nullif(trim(v_m ->> 'source_url'), ''),
          -- Never trust-elevated on import, no matter what the CSV says.
          false, 'unclaimed', null, p_admin_id, p_batch_id
        )
        returning id into v_facility_id;
      else -- approve_update
        update public.facilities set
          name = v_name, slug = coalesce(v_slug, slug), facility_type = coalesce(v_facility_type, facility_type),
          address = v_address, address_line_2 = v_address_line_2, city = v_city, state = v_state,
          postal_code = v_postal_code, country = v_country,
          latitude = v_lat, longitude = v_lng, phone = v_phone, website = v_website,
          google_maps_uri = v_google_maps_uri, description = coalesce(v_description, description),
          court_count = v_court_count, indoor_courts = v_indoor_courts, outdoor_courts = v_outdoor_courts,
          surface_type = coalesce(v_surface_type, surface_type),
          lighting = v_lighting, restrooms = v_restrooms, water = v_water, parking = v_parking,
          pro_shop = v_pro_shop, lessons_available = v_lessons_available, open_play_available = v_open_play_available,
          reservation_required = v_reservation_required, public_access = v_public_access,
          membership_required = v_membership_required, bookable_by_public = v_bookable_by_public,
          booking_url = coalesce(v_booking_url, booking_url),
          fee_type = coalesce(v_fee_type, fee_type), typical_fee = coalesce(v_typical_fee, typical_fee),
          hours_summary = coalesce(v_hours_summary, hours_summary),
          skill_levels = v_skill_levels, amenities = v_amenities, tags = v_tags,
          status = coalesce(v_status, status), data_confidence = coalesce(v_data_confidence, data_confidence),
          last_verified_date = coalesce(v_last_verified_date, last_verified_date), notes = coalesce(v_notes, notes),
          price_level = coalesce(v_price_level, price_level),
          wheelchair_accessible = coalesce(v_wheelchair_accessible, wheelchair_accessible),
          google_rating = coalesce(v_google_rating, google_rating),
          google_rating_count = coalesce(v_google_rating_count, google_rating_count),
          google_types = case when array_length(v_google_types, 1) > 0 then v_google_types else google_types end,
          business_status = coalesce(v_business_status, business_status),
          -- Backfill only — never overwrite an existing google_place_id or
          -- data_source with what the CSV says.
          google_place_id = coalesce(google_place_id, v_gpid),
          updated_at = now(), import_batch_id = p_batch_id
        where id = v_row.matched_facility_id
        returning id into v_facility_id;
      end if;

      -- Primary photo only — mirrors the CLI script's own scope. Upserts on
      -- the same (facility_id, google_photo_name) unique index the script's
      -- generated SQL already relies on, so re-importing a refreshed photo
      -- reference updates the row instead of duplicating it. A row with no
      -- resolvable photo (CSV had none, or it wasn't a genuine Places photo
      -- resource name) simply leaves facility_photos untouched — never an
      -- error, since not every facility has to have a photo.
      if v_photo_name is not null and v_photo_url is not null then
        insert into public.facility_photos (facility_id, url, google_photo_name, is_primary)
        values (v_facility_id, v_photo_url, v_photo_name, true)
        on conflict (facility_id, google_photo_name) where google_photo_name is not null
        do update set url = excluded.url, is_primary = true;
      end if;

      v_applied := v_applied + 1;
      update public.facility_import_rows
        set applied = true, applied_facility_id = v_facility_id, admin_decision = v_action
      where id = v_row.id;
    exception when others then
      v_errored := v_errored + 1;
      update public.facility_import_rows
        set apply_error = sqlerrm, admin_decision = v_action
      where id = v_row.id;
    end;
  end loop;

  update public.facility_import_batches
    set status = 'committed', committed_at = now(), committed_by = p_admin_id, committed_row_count = v_applied
  where id = p_batch_id;

  return query select v_applied, v_skipped, v_errored;
end;
$fn$;

revoke all on function public.admin_commit_facility_import(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_commit_facility_import(uuid, uuid, jsonb) to service_role;
