-- =============================================================================
-- Stop anonymous clients reading listing coordinates out of marketplace_listings
-- =============================================================================
-- Phase 0 of MARKETPLACE_MAP_AUDIT.md (v3) §4.1.
--
-- Same defect, same shape, same fix as 20260825120000_restrict_anon_profile_columns
-- ("Stop anonymous clients reading personal data out of `profiles`"). That
-- migration hardened `profiles` on 2026-08-25. `marketplace_listings` was
-- created two weeks earlier (20260807203246_marketplace.sql) and never received
-- the same treatment, so it still carries Supabase's default
-- `GRANT ALL ON ALL TABLES IN SCHEMA public`.
--
-- Two things line up, exactly as they did for `profiles`:
--   1. RLS policy "marketplace_listings: public read active" has a USING clause
--      of `status = 'active' OR seller_id = auth.uid()`. For an anonymous caller
--      auth.uid() is null, so that reduces to "every active listing" -- which is
--      intended. The Marketplace is a discovery surface.
--   2. `anon` holds TABLE-level privileges, so "every active listing" also means
--      every *column* of it -- including location_lat / location_lng.
--
-- Verified against production 2026-09-08 via information_schema.column_privileges:
-- `anon` held SELECT, INSERT, UPDATE and REFERENCES on all 16 columns. (The
-- audit reported the SELECT half; the write grants are the same root cause and
-- go with it. They were never exploitable -- the INSERT/UPDATE policies check
-- `seller_id = auth.uid()`, which is null for anon -- but an unused grant on a
-- table anon must never write is worth removing while we are here.)
--
-- NOT yet exploitable for data: production currently has 0 listings with a
-- non-null location_lat (2 listings, 1 active). The Marketplace map is precisely
-- the feature that will start populating that column, which is why this lands in
-- Phase 0, before any coordinate exists, rather than after.
--
-- ── What `anon` legitimately needs ──────────────────────────────────────────
-- Exactly one anonymous surface reads this table: the Open Graph metadata
-- fetcher for public /marketplace/<id> share pages
-- (web/src/lib/og/fetchers.ts fetchMarketplaceListingOg, using the anon key via
-- ogClient()). It selects:
--
--   id, title, description, asking_price_cents, location_city, location_state, status
--
-- Seven columns, none of them coordinates. That is the whole anonymous surface,
-- and therefore the whole grant.
--
-- Deliberately excluded:
--   location_lat, location_lng    the point of this migration
--   seller_id                     do not hand out an author graph anonymously
--   min_offer_cents               the seller's negotiating floor
--   brand, model, condition       not needed by any anonymous surface
--   created_at, updated_at        not needed by any anonymous surface
--
-- ── Why `authenticated` is deliberately NOT narrowed here ───────────────────
-- Same call 20260825120000 made for `profiles`, for a concrete reason:
--
--   a) The mobile Marketplace grid queries `select('*')`
--      (listingService.ts LISTING_WITH_PHOTOS_SELECT). In Postgres, `SELECT *`
--      requires privileges on EVERY column -- so revoking any single column
--      from `authenticated` breaks the entire grid, not just that field.
--   b) The grid's distance filter genuinely needs location_lat/location_lng
--      client-side today. Removing that access would silently disable radius
--      filtering -- the very feature the companion Phase 0 change repairs.
--   c) Under the approved v3 model (audit §5.2) this table will never hold a
--      precise coordinate at all. location_lat/location_lng become the *public
--      pickup coordinate*, deliberately chosen by the seller from public
--      options, and a signed-in user reading it is correct by design. There is
--      no "non-public" coordinate here to hide from `authenticated` -- the fix
--      for precise data is that it is never stored, not that it is hidden.
--
-- So `authenticated` keeps its current grants. Any future precise-location
-- column belongs in a separate protected table (audit §5.2), never as a column
-- beside publicly-readable listing rows.
--
-- Additive safety: because the grant below is an explicit column list, any
-- column added to marketplace_listings from now on is unreadable by `anon` until
-- someone deliberately grants it. That default-deny is the durable half of this
-- migration.
-- =============================================================================

begin;

-- A column-level grant cannot be carved out of a table-level one -- the table
-- grant has to go first, then the safe columns are granted back.
revoke all on public.marketplace_listings from anon;

grant select (
  id,
  title,
  description,
  asking_price_cents,
  location_city,
  location_state,
  status
) on public.marketplace_listings to anon;

commit;

-- ─── Verification ────────────────────────────────────────────────────────────
--
-- 1. The hole is closed. Must fail with 42501 (permission denied for column
--    location_lat), not return rows:
--
--    curl -s -H "apikey: <anon key>" \
--      '<project>.supabase.co/rest/v1/marketplace_listings?select=location_lat,location_lng'
--
-- 2. The public share page still works. Must still succeed anonymously --
--    this is the exact column list web/src/lib/og/fetchers.ts sends:
--
--    curl -s -H "apikey: <anon key>" \
--      '<project>.supabase.co/rest/v1/marketplace_listings?select=id,title,description,asking_price_cents,location_city,location_state,status&status=eq.active&limit=1'
--
-- 3. `select=*` is now denied for anon (it expands to columns it cannot read).
--    Expected, and it is why no anonymous caller may use `*` on this table.
--
-- 4. Signed-in behavior is unchanged. The mobile grid's `select('*')` must
--    still return every column for `authenticated`.
--
-- 5. Grants, after:
--    select grantee, privilege_type, string_agg(column_name, ', ' order by column_name)
--      from information_schema.column_privileges
--     where table_schema = 'public' and table_name = 'marketplace_listings'
--       and grantee = 'anon'
--     group by grantee, privilege_type;
--    -> exactly one row: SELECT over the seven columns above.
--
-- ─── Known gap, deliberately out of Phase 0 scope ────────────────────────────
-- `marketplace_listing_photos` still carries the same default table-level grants
-- for `anon` (it holds only id, listing_id, url, sort_order, created_at, so
-- there is no sensitive column to leak, and the OG fetcher reads `url` from it
-- anonymously by design). Tracked, not fixed here.
