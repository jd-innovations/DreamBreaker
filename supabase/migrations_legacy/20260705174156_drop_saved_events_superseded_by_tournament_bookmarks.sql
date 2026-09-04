-- [RECONSTRUCTED 2026-07-24 from deployed production history — supabase_migrations.schema_migrations
--  version 20260705174156. Applied to production but missing locally. Restored verbatim from the
--  deployed statements. Drops the short-lived saved_events table (replaced by tournament_bookmarks
--  + saved_play_events). Do not edit.]

drop table if exists public.saved_events;
