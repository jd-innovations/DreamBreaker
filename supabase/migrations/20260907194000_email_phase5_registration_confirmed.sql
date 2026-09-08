-- Phase 5 migration (row 4/13): wrap registration_confirmed in the shared shell.
-- html_body already structure-only (repaired 2026-08-21) -- no rewrite needed.
-- Highest-volume template in this "no body change" group.
-- Rollback: UPDATE public.email_templates SET layout = NULL, preheader = NULL
-- WHERE key = 'registration_confirmed';

UPDATE public.email_templates
SET
  preheader = 'Your spot in {{tournament_name}} is booked.',
  layout = 'transactional'
WHERE key = 'registration_confirmed';
