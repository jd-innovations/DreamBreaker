-- [RECONSTRUCTED 2026-07-24 from deployed production history — supabase_migrations.schema_migrations
--  version 20260720214747. Applied to production but missing locally. Restored verbatim from the
--  deployed statements. Do not edit.]

-- Postgres grants EXECUTE to PUBLIC by default on new functions. Lock
-- mark_wallet_item_seen down to authenticated only (anon has no auth.uid(),
-- so this was harmless in practice, but the linter is right to flag it).
revoke execute on function public.mark_wallet_item_seen(uuid) from public;
revoke execute on function public.mark_wallet_item_seen(uuid) from anon;
grant execute on function public.mark_wallet_item_seen(uuid) to authenticated;
