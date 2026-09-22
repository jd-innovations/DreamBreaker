-- Typed-SEND confirmation threshold — Phase 5 of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md
-- (decision 14).
--
-- The admin composer makes the operator type SEND before a campaign that
-- targets at least this many devices. The plan assumed this row was seeded in
-- Phase 3; it was not — only push_broadcast_enabled was. Read by the web UI
-- (platform_settings is publicly readable; writes are admin-only by RLS), so
-- it is editable from the existing admin settings screen with no deploy.
--
-- The UI treats a missing or unparseable value as 1 — every send asks for
-- SEND — so a typo fails safe.

insert into public.platform_settings (key, value, value_type, label, description, sort_order)
values (
  'push_broadcast_send_confirm_threshold', '100', 'number',
  'Push broadcasts: typed SEND threshold',
  'A push campaign reaching at least this many devices requires the admin to type SEND to confirm.',
  942
)
on conflict (key) do nothing;
