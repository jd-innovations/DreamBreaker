-- Phase 5 migration (EMAIL_NOTIFICATIONS_EXECUTION_PLAN.md, Phase 5, row 2/13):
-- wrap director_suspended in the shared email shell.
--
-- html_body needs no rewrite -- already structure-only (<h2>/<p>, no color, no
-- wrapper) since the 2026-08-21 incident repair, same shape as
-- director_approved. This migration only adds a preheader and flips the gate.
--
-- Rollback: UPDATE public.email_templates SET layout = NULL, preheader = NULL
-- WHERE key = 'director_suspended';

UPDATE public.email_templates
SET
  preheader = 'Your director access has been suspended.',
  layout = 'transactional'
WHERE key = 'director_suspended';
