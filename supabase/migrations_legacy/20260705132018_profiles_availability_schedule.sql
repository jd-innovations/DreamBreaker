alter table public.profiles
  add column if not exists availability_schedule jsonb not null default '{}'::jsonb;

comment on column public.profiles.availability_schedule is
  'Weekly availability grid: { mon: ["morning","evening"], tue: [], ... }. Values per day are a subset of morning/afternoon/evening.';
