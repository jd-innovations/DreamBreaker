-- location_settings: one row per user holding location & discovery preferences.
-- Upserted on change from the mobile Location settings screen. Mirrors the
-- partner_preferences pattern (owner-only RLS + updated_at trigger).
create table if not exists public.location_settings (
  user_id                 uuid primary key references public.profiles(id) on delete cascade,
  tournament_radius       text        not null default '50 mi',
  community_radius        text        not null default '25 mi',
  partner_radius          text        not null default '50 mi',
  marketplace_radius      text        not null default '50 mi',
  willing_to_ship         boolean     not null default true,
  local_events            boolean     not null default true,
  regional_events         boolean     not null default true,
  major_events            boolean     not null default true,
  national_events         boolean     not null default false,
  show_city               boolean     not null default true,
  show_exact_location     boolean     not null default false,
  allow_distance_matching boolean     not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.location_settings enable row level security;

create policy "owner_all" on public.location_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- keep updated_at current
create or replace function public.touch_location_settings()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger location_settings_updated
  before update on public.location_settings
  for each row execute function public.touch_location_settings();
