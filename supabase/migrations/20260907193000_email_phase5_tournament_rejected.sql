-- Phase 5 migration (row 3/13): wrap tournament_rejected in the shared shell.
-- html_body already structure-only (repaired 2026-08-21) -- no rewrite needed.
-- Rollback: UPDATE public.email_templates SET layout = NULL, preheader = NULL
-- WHERE key = 'tournament_rejected';

UPDATE public.email_templates
SET
  preheader = 'Changes needed on {{tournament_name}}.',
  layout = 'transactional'
WHERE key = 'tournament_rejected';
