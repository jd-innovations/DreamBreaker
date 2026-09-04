-- Facilities directory enrichment: adds the columns carried by the curated
-- CSV directory export, plus Google-photo-name support on facility_photos so
-- images can be served through our own Places-photo proxy (Edge Function).
-- All additive/non-breaking.

alter table public.facilities
  add column if not exists facility_type         text,
  add column if not exists address_line_2        text,
  add column if not exists country               text        not null default 'US',
  add column if not exists source_url            text,
  add column if not exists pro_shop              boolean     not null default false,
  add column if not exists lessons_available     boolean     not null default false,
  add column if not exists open_play_available   boolean     not null default false,
  add column if not exists reservation_required  boolean     not null default false,
  add column if not exists booking_url           text,
  add column if not exists fee_type              text,
  add column if not exists typical_fee           text,
  add column if not exists hours_summary         text,
  add column if not exists skill_levels          text[]      not null default '{}',
  add column if not exists amenities             text[]      not null default '{}',
  add column if not exists tags                  text[]      not null default '{}',
  add column if not exists status                text,
  add column if not exists data_confidence       integer,
  add column if not exists last_verified_date    timestamptz,
  add column if not exists notes                 text,
  add column if not exists import_batch_id       uuid,
  -- Curation-pipeline author id (external user system) — plain uuid, no FK.
  add column if not exists created_by            uuid,
  add column if not exists price_level           integer,
  add column if not exists wheelchair_accessible boolean,
  add column if not exists google_rating         numeric(2,1),
  add column if not exists google_rating_count   integer,
  add column if not exists google_types          text[]      not null default '{}',
  add column if not exists business_status        text;

comment on column public.facilities.status          is 'Curation-pipeline review state (e.g. approved). Distinct from verified / claim_status.';
comment on column public.facilities.data_confidence is 'Curation confidence score 0-100 from the directory pipeline.';
comment on column public.facilities.hours_summary   is 'Human-readable weekly hours block (free text).';

-- Photo proxy support: store the Google Places photo resource name
-- ("places/{place_id}/photos/{ref}") so our Edge Function can fetch the media
-- with the server-side API key. facility_photos.url holds the proxy URL.
alter table public.facility_photos
  add column if not exists google_photo_name text;

comment on column public.facility_photos.google_photo_name is 'Google Places photo resource name, served via the facility-photo Edge Function.';

-- Idempotent re-imports: one row per (facility, google photo).
create unique index if not exists uq_facility_photos_google_name
  on public.facility_photos(facility_id, google_photo_name)
  where google_photo_name is not null;
