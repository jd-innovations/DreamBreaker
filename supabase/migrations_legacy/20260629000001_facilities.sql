-- =============================================================================
-- DreamBreaker PB — Facilities Directory
-- Migration: 20260629000001_facilities
--
-- Creates:
--   facilities        — core directory table
--   facility_photos   — photo gallery per facility
--   tournaments.facility_id   — optional link (nullable, non-breaking)
--   play_events.facility_id   — optional link (nullable, non-breaking)
-- =============================================================================


-- =============================================================================
-- FACILITIES
-- =============================================================================

create table public.facilities (
  id                  uuid          primary key default gen_random_uuid(),
  name                text          not null,
  slug                text          unique,
  -- Address
  address             text          not null,
  city                text          not null,
  state               text          not null,
  postal_code         text,
  -- Geo (lat/lng stored for direct use; coords computed by trigger for PostGIS)
  latitude            numeric(9,6)  not null,
  longitude           numeric(9,6)  not null,
  coords              geography(point, 4326),   -- kept in sync by trigger
  -- Contact
  phone               text,
  website             text,
  description         text,
  -- Court details
  court_count         integer       not null default 0,
  indoor_courts       integer       not null default 0,
  outdoor_courts      integer       not null default 0,
  surface_type        text,         -- 'hard' | 'clay' | 'grass' | 'carpet' | etc.
  -- Amenities
  lighting            boolean       not null default false,
  restrooms           boolean       not null default false,
  water               boolean       not null default false,
  parking             boolean       not null default false,
  -- Access model
  public_access       boolean       not null default true,
  membership_required boolean       not null default false,
  bookable_by_public  boolean       not null default false,
  -- Claim / ownership
  claim_status        text          not null default 'unclaimed',
  owner_user_id       uuid          references public.profiles(id) on delete set null,
  -- Verification
  verified            boolean       not null default false,
  -- Metadata
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),

  -- Checks
  constraint check_court_count    check (court_count    >= 0),
  constraint check_indoor_courts  check (indoor_courts  >= 0),
  constraint check_outdoor_courts check (outdoor_courts >= 0),
  constraint check_court_subtotals check (
    court_count = 0
    or (indoor_courts + outdoor_courts) <= court_count
  ),
  constraint check_latitude  check (latitude  between -90  and 90),
  constraint check_longitude check (longitude between -180 and 180),
  constraint check_claim_status check (
    claim_status in ('unclaimed', 'pending', 'claimed')
  )
);

comment on table public.facilities is 'Pickleball facility directory. Supports public, private, and membership-required venues.';
comment on column public.facilities.coords        is 'PostGIS geography point kept in sync with latitude/longitude by trigger.';
comment on column public.facilities.public_access is 'True for public parks, open courts, and general-access clubs.';
comment on column public.facilities.membership_required is 'True for clubs, HOAs, and facilities requiring paid or approved membership.';
comment on column public.facilities.bookable_by_public  is 'True when courts can be reserved by any user through the app.';
comment on column public.facilities.claim_status  is 'unclaimed: no owner | pending: claim submitted | claimed: owner verified.';
comment on column public.facilities.verified      is 'Set to true by admin after confirming facility data.';


-- =============================================================================
-- TRIGGER — sync coords from latitude / longitude
-- geography generated columns are not supported in Postgres 15; use a trigger.
-- Fires on INSERT and on UPDATE of latitude or longitude.
-- =============================================================================

create or replace function public.fn_sync_facility_coords()
returns trigger language plpgsql as $$
begin
  new.coords := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;
  return new;
end;
$$;

create trigger trg_sync_facility_coords
  before insert or update of latitude, longitude
  on public.facilities
  for each row execute function public.fn_sync_facility_coords();


-- =============================================================================
-- TRIGGER — updated_at (reuse existing fn_set_updated_at helper)
-- =============================================================================

create trigger trg_facilities_updated_at
  before update on public.facilities
  for each row execute function public.fn_set_updated_at();


-- =============================================================================
-- TRIGGER — facility slug auto-generation
-- =============================================================================

create or replace function public.fn_generate_facility_slug()
returns trigger language plpgsql as $$
declare
  v_base    text;
  v_slug    text;
  v_counter integer := 0;
begin
  if new.slug is not null then
    return new;
  end if;

  v_base := lower(
    regexp_replace(
      unaccent(new.name || ' ' || new.city || ' ' || new.state),
      '[^a-z0-9]+', '-', 'g'
    )
  );
  v_base := trim(both '-' from v_base);
  v_slug := v_base;

  while exists (select 1 from public.facilities where slug = v_slug) loop
    v_counter := v_counter + 1;
    v_slug    := v_base || '-' || v_counter;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

create trigger trg_generate_facility_slug
  before insert on public.facilities
  for each row execute function public.fn_generate_facility_slug();


-- =============================================================================
-- FACILITY_PHOTOS
-- =============================================================================

create table public.facility_photos (
  id          uuid        primary key default gen_random_uuid(),
  facility_id uuid        not null references public.facilities(id) on delete cascade,
  url         text        not null,
  is_primary  boolean     not null default false,
  uploaded_by uuid        references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.facility_photos is 'Photo gallery for each facility. is_primary marks the cover image shown in map previews.';


-- =============================================================================
-- FOREIGN KEYS ON EXISTING TABLES (nullable — non-breaking)
-- =============================================================================

alter table public.tournaments
  add column if not exists facility_id uuid references public.facilities(id) on delete set null;

comment on column public.tournaments.facility_id is 'Optional link to the facilities directory. venue_name/venue_address remain the primary free-text fields.';

alter table public.play_events
  add column if not exists facility_id uuid references public.facilities(id) on delete set null;

comment on column public.play_events.facility_id is 'Optional link to the facilities directory. location/venue_name remain the primary free-text fields.';


-- =============================================================================
-- INDEXES — facilities
-- =============================================================================

-- Geo proximity (primary use case: map discovery)
create index idx_facilities_coords        on public.facilities using gist(coords);

-- City + state filter (browse by location)
create index idx_facilities_city_state    on public.facilities(city, state);

-- Full-text / trigram search on name
create index idx_facilities_name_trgm     on public.facilities using gin(lower(name) gin_trgm_ops);

-- Admin / filter columns
create index idx_facilities_verified      on public.facilities(verified);
create index idx_facilities_public_access on public.facilities(public_access);
create index idx_facilities_claim_status  on public.facilities(claim_status);
create index idx_facilities_owner         on public.facilities(owner_user_id);


-- =============================================================================
-- INDEXES — facility_photos
-- =============================================================================

create index idx_facility_photos_facility   on public.facility_photos(facility_id);
-- Partial index: at most one primary photo lookup per facility
create index idx_facility_photos_primary    on public.facility_photos(facility_id)
  where is_primary = true;


-- =============================================================================
-- INDEXES — existing tables (facility_id FK)
-- =============================================================================

create index if not exists idx_tournaments_facility on public.tournaments(facility_id)
  where facility_id is not null;

create index if not exists idx_play_events_facility on public.play_events(facility_id)
  where facility_id is not null;


-- =============================================================================
-- ROW LEVEL SECURITY — ENABLE
-- =============================================================================

alter table public.facilities      enable row level security;
alter table public.facility_photos enable row level security;


-- =============================================================================
-- RLS POLICIES — facilities
-- =============================================================================

-- Anyone (including anon) can browse the directory
create policy "facilities: public read"
  on public.facilities for select
  using (true);

-- Any logged-in user can suggest a new facility (verified starts false)
create policy "facilities: authenticated insert"
  on public.facilities for insert
  with check (auth.uid() is not null);

-- Claimed owner can update their own facility profile
-- (cannot self-approve: verified and claim_status are admin-only via separate admin policy)
create policy "facilities: owner update"
  on public.facilities for update
  using (owner_user_id = auth.uid())
  with check (
    owner_user_id = auth.uid()
    -- Owners cannot self-verify or change claim_status
    and verified     = (select verified     from public.facilities where id = facilities.id)
    and claim_status = (select claim_status from public.facilities where id = facilities.id)
  );

-- Admin full access (uses existing is_admin() helper)
create policy "facilities: admin full access"
  on public.facilities for all
  using (public.is_admin());


-- =============================================================================
-- RLS POLICIES — facility_photos
-- =============================================================================

-- Public read (needed for map preview bottom sheet)
create policy "facility_photos: public read"
  on public.facility_photos for select
  using (true);

-- Any logged-in user can upload a photo
create policy "facility_photos: authenticated insert"
  on public.facility_photos for insert
  with check (auth.uid() is not null and uploaded_by = auth.uid());

-- Uploader can delete their own photo; admin can delete any
create policy "facility_photos: uploader delete"
  on public.facility_photos for delete
  using (uploaded_by = auth.uid() or public.is_admin());

-- Admin full access
create policy "facility_photos: admin full access"
  on public.facility_photos for all
  using (public.is_admin());
