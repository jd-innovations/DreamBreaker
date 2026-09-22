-- Announcements opt-out — Phase 1, Migration A of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
--
-- One boolean per notification category is the house model (notif_messages,
-- notif_marketplace, …). Admin broadcasts are a new category, so they get their
-- own column rather than riding on an existing one: someone who wants DMs but
-- not platform announcements must be able to say so.
--
-- Default TRUE, matching every other notif_* column: an existing user who never
-- opens the setting keeps the behaviour they had. Adding a NOT NULL column with
-- a constant default is metadata-only on this Postgres, so no table rewrite and
-- no backfill, and the signup trigger (which names its columns) is unaffected.
--
-- NOTHING HONOURS THIS YET. The broadcast worker that reads it is Phase 3, and
-- the toggles that write it are Phase 6 (mobile notifications-settings, web
-- match-settings).

alter table public.profiles
  add column if not exists notif_announcements boolean not null default true;

comment on column public.profiles.notif_announcements is
  'Opt-out for admin push broadcasts (notification_campaigns, category platform_announcements). '
  'Default true, like every notif_* column. Honoured by the broadcast worker (Phase 3 of '
  'PUSH_BROADCAST_IMPLEMENTATION_PLAN.md) -- nothing reads it before then.';

-- profiles is on a COLUMN-level SELECT grant (20260921150000), so a new column
-- is invisible to clients until granted. Without this, Phase 6's settings
-- screen would select it and the whole query would fail. Same grant as the
-- other notif_* columns: authenticated reads; anon does not. UPDATE needs no
-- grant — it is table-level on profiles, and RLS limits it to the own row.
grant select (notif_announcements) on public.profiles to authenticated;
