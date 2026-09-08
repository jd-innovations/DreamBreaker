-- Phase 5 migration (row 9/13): wrap facility_manager_rejected in the shared shell.
-- html_body already structure-only, no CTA -- no rewrite needed.
-- Rollback: UPDATE public.email_templates SET layout = NULL
-- WHERE key = 'facility_manager_rejected';
-- (preheader already existed pre-Phase-5, unchanged.)

UPDATE public.email_templates
SET layout = 'transactional'
WHERE key = 'facility_manager_rejected';
