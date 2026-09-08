-- partner_preferences: one row per user, upserted on save
create table if not exists public.partner_preferences (
  user_id              uuid primary key references public.profiles(id) on delete cascade,
  actively_looking     boolean      not null default true,
  game_types           text[]       not null default '{}',
  skill_ranges         text[]       not null default '{}',
  distance_idx         smallint     not null default 1,
  preferred_days       text[]       not null default '{}',
  preferred_times      text[]       not null default '{}',
  gender_preference    text         not null default 'No Preference',
  age_preference       text         not null default 'No Preference',
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now()
);

alter table public.partner_preferences enable row level security;

create policy "owner_all" on public.partner_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- keep updated_at current
create or replace function public.touch_partner_preferences()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger partner_preferences_updated
  before update on public.partner_preferences
  for each row execute function public.touch_partner_preferences();
