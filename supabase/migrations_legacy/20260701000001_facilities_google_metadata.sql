-- Facilities: external source metadata for imports

alter table public.facilities
  add column if not exists google_place_id text,
  add column if not exists data_source text not null default 'manual',
  add column if not exists google_maps_uri text;

drop index if exists public.uq_facilities_google_place_id;
create unique index if not exists uq_facilities_google_place_id
  on public.facilities(google_place_id);

create index if not exists idx_facilities_data_source
  on public.facilities(data_source);