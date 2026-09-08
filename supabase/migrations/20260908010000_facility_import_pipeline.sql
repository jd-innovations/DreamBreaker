-- Admin facility-directory CSV import pipeline.
--
-- Builds on scripts/import-facilities-csv.mjs's dedup key (google_place_id
-- when present, else no match) with a real geo+name fuzzy match for CSVs
-- that don't carry Google's id, using extensions already enabled in this
-- project (pg_trgm for name similarity, postgis for distance) and the
-- existing indexes (idx_facilities_name_trgm, idx_facilities_coords).
--
-- Two-phase, matching the mandated workflow:
--   1. STAGE (admin_stage_facility_import) — matches every row, writes it to
--      facility_import_rows for review. Runs under the admin's own session
--      (auth.uid() resolves normally); touches only the two new tables
--      below, never `facilities`, so it is safe to call freely and re-run.
--   2. COMMIT (admin_commit_facility_import) — the only thing that writes to
--      `facilities`. Deliberately NOT callable by any authenticated client:
--      updating an already-claimed/verified facility has no RLS policy that
--      would allow it (see 20260901090000_facilities_rls_hardening.sql —
--      "authenticated claim" only covers unclaimed rows, "owner update" only
--      covers the owner), so this has to run as service_role from the
--      admin-facility-import-commit edge function, which authenticates the
--      caller via their own JWT FIRST (same pattern as
--      claim_coach_refund/refund-coach-purchase) and passes their resolved
--      user id in explicitly as p_admin_id — a service-role session has no
--      auth.uid() to fall back on.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

create table public.facility_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  filename text not null,
  storage_path text not null,
  status text not null default 'dry_run' check (status in ('dry_run', 'committed', 'failed')),
  row_count int not null default 0,
  confident_count int not null default 0,
  possible_count int not null default 0,
  new_count int not null default 0,
  invalid_count int not null default 0,
  committed_at timestamptz,
  committed_by uuid references public.profiles(id),
  committed_row_count int,
  notes text
);

comment on table public.facility_import_batches is
  'One row per admin CSV upload for the facility directory. Created by admin_stage_facility_import (dry run); committed_* fields fill in when admin_commit_facility_import applies it.';

create table public.facility_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.facility_import_batches(id) on delete cascade,
  row_number int not null,
  raw jsonb not null,
  mapped jsonb not null,
  match_type text not null check (match_type in ('confident', 'possible', 'new', 'invalid')),
  matched_facility_id uuid references public.facilities(id),
  match_score numeric,
  match_reason text,
  error text,
  -- Set by the admin in the review UI before commit; required for 'possible'
  -- rows (commit skips a 'possible' row with no decision rather than guess).
  admin_decision text check (admin_decision in ('approve_update', 'create_new', 'skip')),
  applied boolean not null default false,
  applied_facility_id uuid references public.facilities(id),
  apply_error text,
  created_at timestamptz not null default now()
);

create index idx_facility_import_rows_batch on public.facility_import_rows(batch_id);
create index idx_facility_import_rows_match_type on public.facility_import_rows(batch_id, match_type);

comment on table public.facility_import_rows is
  'One row per CSV line for a facility_import_batches batch — the match result an admin reviews before commit, and the applied outcome after.';

alter table public.facility_import_batches enable row level security;
alter table public.facility_import_rows enable row level security;

-- Read-only for admins via the normal client (the review UI). All writes to
-- these two tables happen inside the two SECURITY DEFINER functions below,
-- which run as the table owner and so bypass RLS regardless — no INSERT/
-- UPDATE policy is needed or offered to `authenticated`.
create policy "facility_import_batches: admin read" on public.facility_import_batches
  for select using (public.is_admin());

create policy "facility_import_rows: admin read" on public.facility_import_rows
  for select using (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage: the original CSV, for audit + reprocessing
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
values ('facility-import-uploads', 'facility-import-uploads', false, false, 26214400, array['text/csv', 'application/vnd.ms-excel', 'text/plain'])
on conflict (id) do update set
  "public" = excluded."public",
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "admin insert facility-import-uploads" on storage.objects
  for insert with check (bucket_id = 'facility-import-uploads' and public.is_admin());

create policy "admin read facility-import-uploads" on storage.objects
  for select using (bucket_id = 'facility-import-uploads' and public.is_admin());

create policy "admin delete facility-import-uploads" on storage.objects
  for delete using (bucket_id = 'facility-import-uploads' and public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Matching
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.find_facility_match(
  p_name text,
  p_lat numeric,
  p_lng numeric,
  p_google_place_id text
) returns table (facility_id uuid, match_type text, score numeric, reason text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_point geography;
begin
  if p_google_place_id is not null and length(trim(p_google_place_id)) > 0 then
    return query
      select f.id, 'confident'::text, 1.0::numeric, 'google_place_id exact match'::text
      from public.facilities f
      where f.google_place_id = p_google_place_id
      limit 1;
    if found then return; end if;
  end if;

  if p_lat is null or p_lng is null then
    return;
  end if;

  v_point := ST_SetSRID(ST_MakePoint(p_lng::double precision, p_lat::double precision), 4326)::geography;

  return query
    select
      cand.id,
      case when cand.sim >= 0.6 and cand.dist <= 75 then 'confident' else 'possible' end,
      cand.sim,
      format('name similarity %s, %s m away', round(cand.sim::numeric, 2), round(cand.dist)::int)
    from (
      select
        f.id,
        similarity(unaccent(lower(f.name)), unaccent(lower(p_name))) as sim,
        ST_Distance(f.coords, v_point) as dist
      from public.facilities f
      where f.coords is not null
        and ST_DWithin(f.coords, v_point, 200)
    ) cand
    where cand.sim >= 0.35
    order by cand.sim desc, cand.dist asc
    limit 1;
end;
$fn$;

revoke all on function public.find_facility_match(text, numeric, numeric, text) from public;
grant execute on function public.find_facility_match(text, numeric, numeric, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Stage (dry run) — admin's own session, touches only the two tables above.
-- ─────────────────────────────────────────────────────────────────────────────

-- p_rows: jsonb array of { row_number: int, raw: jsonb, mapped: jsonb }.
-- `mapped` keys mirror facilities columns 1:1 (see admin_commit_facility_import
-- for the full list) — the admin webapp maps the CSV the same way
-- scripts/import-facilities-csv.mjs's mapRow() does, just producing JSON
-- instead of SQL literals.
create or replace function public.admin_stage_facility_import(
  p_filename text,
  p_storage_path text,
  p_rows jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_batch_id uuid;
  v_row jsonb;
  v_mapped jsonb;
  v_name text;
  v_lat numeric;
  v_lng numeric;
  v_gpid text;
  v_match record;
  v_confident int := 0;
  v_possible int := 0;
  v_new int := 0;
  v_invalid int := 0;
  v_error text;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;

  insert into public.facility_import_batches (created_by, filename, storage_path, status, row_count)
  values (auth.uid(), p_filename, p_storage_path, 'dry_run', jsonb_array_length(p_rows))
  returning id into v_batch_id;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_mapped := v_row -> 'mapped';
    v_error := null;

    v_name := nullif(trim(v_mapped ->> 'name'), '');
    v_gpid := nullif(trim(v_mapped ->> 'google_place_id'), '');
    begin
      v_lat := nullif(v_mapped ->> 'latitude', '')::numeric;
      v_lng := nullif(v_mapped ->> 'longitude', '')::numeric;
    exception when others then
      v_lat := null; v_lng := null;
    end;

    if v_name is null then
      v_error := 'missing facility name';
    elsif nullif(trim(v_mapped ->> 'address'), '') is null then
      v_error := 'missing address';
    elsif nullif(trim(v_mapped ->> 'city'), '') is null then
      v_error := 'missing city';
    elsif nullif(trim(v_mapped ->> 'state'), '') is null then
      v_error := 'missing state';
    elsif v_lat is null or v_lng is null then
      v_error := 'missing or non-numeric latitude/longitude';
    elsif v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then
      v_error := 'latitude/longitude out of range';
    end if;

    if v_error is not null then
      v_invalid := v_invalid + 1;
      insert into public.facility_import_rows (batch_id, row_number, raw, mapped, match_type, error)
      values (v_batch_id, coalesce((v_row ->> 'row_number')::int, 0), coalesce(v_row -> 'raw', '{}'::jsonb), v_mapped, 'invalid', v_error);
      continue;
    end if;

    select * into v_match from public.find_facility_match(v_name, v_lat, v_lng, v_gpid) limit 1;

    if v_match.facility_id is not null then
      if v_match.match_type = 'confident' then v_confident := v_confident + 1;
      else v_possible := v_possible + 1;
      end if;
      insert into public.facility_import_rows
        (batch_id, row_number, raw, mapped, match_type, matched_facility_id, match_score, match_reason)
      values
        (v_batch_id, coalesce((v_row ->> 'row_number')::int, 0), coalesce(v_row -> 'raw', '{}'::jsonb), v_mapped,
         v_match.match_type, v_match.facility_id, v_match.score, v_match.reason);
    else
      v_new := v_new + 1;
      insert into public.facility_import_rows (batch_id, row_number, raw, mapped, match_type)
      values (v_batch_id, coalesce((v_row ->> 'row_number')::int, 0), coalesce(v_row -> 'raw', '{}'::jsonb), v_mapped, 'new');
    end if;
  end loop;

  update public.facility_import_batches
    set confident_count = v_confident, possible_count = v_possible, new_count = v_new, invalid_count = v_invalid
  where id = v_batch_id;

  return v_batch_id;
end;
$fn$;

revoke all on function public.admin_stage_facility_import(text, text, jsonb) from public;
grant execute on function public.admin_stage_facility_import(text, text, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Commit — service_role only. See the header comment for why.
-- ─────────────────────────────────────────────────────────────────────────────

-- p_decisions: jsonb object of { "<facility_import_rows.id>": "approve_update" | "create_new" | "skip" }.
-- Rows not mentioned default to: confident -> approve_update, new -> create_new,
-- possible -> skip (an uncertain match is never applied without an explicit
-- decision), invalid -> always skipped regardless of p_decisions.
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

-- service_role only — see the function header comment for why this cannot be
-- granted to `authenticated`, even an admin.
revoke all on function public.admin_commit_facility_import(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_commit_facility_import(uuid, uuid, jsonb) to service_role;
