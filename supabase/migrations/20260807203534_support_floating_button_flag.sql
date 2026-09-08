-- Support Experience Architecture, Phase 0: kill switch for the future
-- context-aware floating support launcher (SUPPORT_EXPERIENCE_ARCHITECTURE.md
-- §22). Reuses the existing generic platform_settings key-value table rather
-- than standing up a separate feature_flags table -- it already has admin
-- read/write RLS, a live admin-dashboard editor (web/src/app/admin/page.tsx),
-- and boolean value_type support, so a new mechanism would just duplicate it.
-- Default is off; nothing renders until this is flipped on for a beta cohort.

INSERT INTO "public"."platform_settings" ("key", "value", "value_type", "label", "description", "sort_order")
VALUES (
  'support_floating_button_enabled',
  'false',
  'boolean',
  'Support: Floating Button',
  'Shows the context-aware floating support launcher across eligible screens. Off by default during rollout.',
  5
);
