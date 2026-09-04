-- Add partner columns to play_matches to support doubles & rotating-partner
-- round robins. Singles leaves both null.

alter table public.play_matches
  add column if not exists player_a2_id uuid references public.play_participants(id) on delete cascade,
  add column if not exists player_b2_id uuid references public.play_participants(id) on delete cascade;

comment on column public.play_matches.player_a2_id is 'Partner of player_a in doubles/rotating formats; null for singles.';
comment on column public.play_matches.player_b2_id is 'Partner of player_b in doubles/rotating formats; null for singles.';
