-- Support Experience Architecture, Phase 0: give a support_tickets row
-- somewhere to carry the SupportContext/diagnostics snapshot captured by the
-- future floating support launcher, and a way to tell how the ticket was
-- opened. jsonb (not relational columns per field) because the context/
-- diagnostics field set is still being discovered — see
-- SUPPORT_EXPERIENCE_ARCHITECTURE.md §20.

ALTER TABLE "public"."support_tickets"
  ADD COLUMN "context" jsonb,
  ADD COLUMN "diagnostics" jsonb,
  ADD COLUMN "source" text NOT NULL DEFAULT 'help_screen';

COMMENT ON COLUMN "public"."support_tickets"."context" IS 'Serialized SupportContext (route/feature/entity) at time of creation. Never contains message content, financial details, or PII beyond what the reporter typed.';
COMMENT ON COLUMN "public"."support_tickets"."diagnostics" IS 'Serialized lightweight client diagnostics snapshot (app version, platform, recent route history, last error code) at time of creation.';
COMMENT ON COLUMN "public"."support_tickets"."source" IS 'Entry point that created this ticket: help_screen (existing /help-support flow) or floating_button (new context-aware launcher).';
