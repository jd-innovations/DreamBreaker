-- Adds the "Clinic" community-play event type (instructor-led lesson, orange
-- pill on cards) and an instructor_id column so an organizer can hand
-- instructor duties to someone else without losing organizer ownership.

alter type play_event_type add value if not exists 'clinic';

alter table public.play_events
  add column instructor_id uuid references public.profiles(id) on delete set null;
