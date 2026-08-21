-- Phase 4 of EMAIL_NOTIFICATIONS_EXECUTION_PLAN.md: the wrap gate.
--
-- NO-OP ON APPLY. Every existing row gets layout = NULL, and the edge function
-- only wraps when layout IS NOT NULL, so nothing a recipient receives changes
-- until templates are migrated one at a time in Phase 5. That is the point:
-- the machinery ships and sits inert, and each template is switched on
-- individually with a single-row rollback.
--
-- `layout` carries the transactional/notification distinction rather than being
-- a plain on/off flag, because that distinction decides real behaviour:
--
--   NULL            legacy whole-document body; send unwrapped
--   'transactional' wrapped; preferences link only; always sends, because you
--                   cannot unsubscribe from a receipt for something you bought
--   'notification'  wrapped; unsubscribe + preferences; must respect the user's
--                   notification settings once that surface exists
--
-- One column doing both jobs means a template can never be wrapped in the wrong
-- footer treatment, or be preference-exempt by accident.
--
-- `preheader` is the grey line an inbox shows after the subject. No template has
-- one today, so recipients see whatever the body's first words are. Added here
-- rather than in its own migration because it is one ALTER on the same table.

ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS layout text
    CONSTRAINT email_templates_layout_check
    CHECK (layout IS NULL OR layout IN ('transactional', 'notification')),
  ADD COLUMN IF NOT EXISTS preheader text;

COMMENT ON COLUMN public.email_templates.layout IS
  'NULL = legacy body, sent unwrapped. transactional = wrapped, prefs link only, always sends. notification = wrapped, unsubscribe + prefs, respects notification preferences.';

COMMENT ON COLUMN public.email_templates.preheader IS
  'Inbox preview line shown after the subject. Plain text; supports {{variables}}. Falls back to the subject when null.';

-- ── Verification ─────────────────────────────────────────────────────────────
--   -- expect 21 rows, all layout NULL, so this migration changed no output:
--   select count(*) filter (where layout is null) as unwrapped, count(*) as total
--     from public.email_templates;
