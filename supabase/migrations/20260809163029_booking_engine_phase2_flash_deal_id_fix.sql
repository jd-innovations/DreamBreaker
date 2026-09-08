-- Follow-up to booking_engine_phase2_reservation_core: create_reservation()
-- computed the flash-deal discount percentage but never captured which
-- flash_deals row it came from, leaving reservations.flash_deal_id always
-- null. Replace the percent-only helper with one that also returns the
-- deal id, and have create_reservation store it.

CREATE OR REPLACE FUNCTION "public"."reservation_best_flash_deal"(
    "p_asset_type" "public"."facility_asset_owner_type", "p_asset_id" uuid, "p_at" timestamptz
  )
  RETURNS TABLE("id" uuid, "discount_percent" smallint)
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
  SELECT fd.id, fd.discount_percent
    FROM public.flash_deals fd
   WHERE fd.owner_type = p_asset_type AND fd.owner_id = p_asset_id
     AND fd.is_active = true AND p_at >= fd.starts_at AND p_at < fd.ends_at
   ORDER BY fd.discount_percent DESC
   LIMIT 1;
$$;

DROP FUNCTION IF EXISTS "public"."reservation_best_flash_deal_percent"("public"."facility_asset_owner_type", uuid, timestamptz);

CREATE OR REPLACE FUNCTION "public"."create_reservation"(
    "p_facility_id" uuid,
    "p_asset_type" "public"."facility_asset_owner_type",
    "p_asset_id" uuid,
    "p_starts_at" timestamptz,
    "p_ends_at" timestamptz,
    "p_game_format" "public"."reservation_game_format" DEFAULT NULL,
    "p_hold_minutes" integer DEFAULT 10
  ) RETURNS "public"."reservations"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO 'public'
  AS $$
declare
  v_organizer uuid := auth.uid();
  v_resolved_facility uuid;
  v_max_players smallint;
  v_base_rate integer;
  v_deal record;
  v_row public.reservations;
begin
  if v_organizer is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_asset_type not in ('court', 'ball_machine') then
    raise exception 'invalid_asset_type' using errcode = 'P0002';
  end if;

  v_resolved_facility := public.facility_id_for_owner(p_asset_type, p_asset_id);
  if v_resolved_facility is null or v_resolved_facility <> p_facility_id then
    raise exception 'asset_not_found' using errcode = 'P0003', hint = 'Asset does not belong to the given facility.';
  end if;

  if p_asset_type = 'ball_machine' then
    if p_game_format is not null then
      raise exception 'invalid_game_format_for_ball_machine' using errcode = 'P0005';
    end if;
    v_max_players := 1;
  else
    if p_game_format is null then
      raise exception 'game_format_required' using errcode = 'P0006';
    end if;
    v_max_players := case p_game_format when 'singles' then 2 when 'doubles' then 4 end;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_asset_type::text || ':' || p_asset_id::text, 0));

  v_base_rate := coalesce(public.reservation_asset_hourly_rate_cents(p_asset_type, p_asset_id), 0);
  select * into v_deal from public.reservation_best_flash_deal(p_asset_type, p_asset_id, p_starts_at);

  begin
    insert into reservations (
      facility_id, asset_type, asset_id, organizer_id, game_format, max_players,
      time_range, status, hold_expires_at, base_price_cents,
      flash_deal_discount_percent, final_price_cents, flash_deal_id
    ) values (
      p_facility_id, p_asset_type, p_asset_id, v_organizer, p_game_format, v_max_players,
      tstzrange(p_starts_at, p_ends_at, '[)'), 'held', now() + make_interval(mins => p_hold_minutes),
      v_base_rate, v_deal.discount_percent,
      round(v_base_rate * (100 - coalesce(v_deal.discount_percent, 0)) / 100.0),
      v_deal.id
    )
    returning * into v_row;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0004', hint = 'This asset is already booked for an overlapping time.';
  end;

  insert into reservation_players (reservation_id, profile_id, is_organizer)
  values (v_row.id, v_organizer, true);

  return v_row;
end;
$$;
