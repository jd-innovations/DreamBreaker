-- Phase 5 pilot migration (EMAIL_NOTIFICATIONS_EXECUTION_PLAN.md, Phase 5,
-- row 1/13): wrap director_approved in the shared email shell.
--
-- director_approved's html_body needs no rewrite -- it was already
-- structure-only (<h2>/<p>, no hardcoded color, no wrapper div) since the
-- 2026-08-21 incident repair. This migration only adds a preheader and flips
-- the wrap gate. Chosen as the pilot: no CTA, no body change, admin-triggered
-- (low, controllable volume) -- the lowest-risk row to prove the Phase 5
-- process end-to-end before touching the other 12.
--
-- Rollback: UPDATE public.email_templates SET layout = NULL, preheader = NULL
-- WHERE key = 'director_approved';

UPDATE public.email_templates
SET
  preheader = 'You can now create and manage tournaments on Pickleball App.',
  layout = 'transactional'
WHERE key = 'director_approved';
