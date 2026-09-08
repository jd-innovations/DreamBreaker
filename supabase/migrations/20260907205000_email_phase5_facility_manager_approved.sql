-- Phase 5 migration (row 12/13): wrap facility_manager_approved in the shared
-- shell. Also fixes a pre-existing bug found while auditing this row: the CTA
-- used <a class="btn">, but the shell's <style> block never defines .btn --
-- the button has been rendering as a bare unstyled link since this template
-- was created (independent of the layout gate). Replaced with the same
-- inline-styled anchor pattern the other CTA templates use.
--
-- Before: <p>Hi {{full_name}},</p><p>You are now the manager of <strong>{{facility_name}}</strong>
--           on Pickleball App. The corrections you submitted have been applied to the listing.</p>
--           <p>Next: add your courts and their hourly rates so players can book them.</p>
--           <p><a href="https://pickleballapp.app/facility/manage" class="btn">Set up your facility</a></p>
--
-- Rollback: restore the "Before" body above and
-- UPDATE public.email_templates SET layout = NULL WHERE key = 'facility_manager_approved';
-- (preheader already existed pre-Phase-5, unchanged.)

UPDATE public.email_templates
SET
  html_body = '<p>Hi {{full_name}},</p><p>You are now the manager of <strong>{{facility_name}}</strong> on Pickleball App. The corrections you submitted have been applied to the listing.</p><p>Next: add your courts and their hourly rates so players can book them.</p><p><a href="https://pickleballapp.app/facility/manage" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Set up your facility</a></p>',
  layout = 'transactional'
WHERE key = 'facility_manager_approved';
