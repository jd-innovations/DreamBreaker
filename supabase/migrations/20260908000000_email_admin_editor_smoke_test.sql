-- Smoke test for the new /admin Email Templates editor (real dryRun preview,
-- layout/preheader fields, no second source of truth): a trivial content
-- edit to director_approved, applied the same way saveTemplate() does, to
-- prove the edit -> preview -> send path works end to end post-refactor.
--
-- Rollback: UPDATE public.email_templates
-- SET html_body = '<h2>You''re an approved director</h2><p>Hi {{full_name}},</p><p>Your director account is approved. You can now create and manage tournaments on Pickleball App.</p>'
-- WHERE key = 'director_approved';

UPDATE public.email_templates
SET html_body = '<h2>You''re an approved director</h2><p>Hi {{full_name}},</p><p>Your director account is approved. You can now create and manage tournaments on Pickleball App.</p><p>Welcome to the team!</p>'
WHERE key = 'director_approved';
