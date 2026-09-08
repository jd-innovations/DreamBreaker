-- Phase 5 migration (row 7/13): wrap support_ticket_new in the shared shell.
-- Admin-facing (fires to admins on new ticket).
--
-- Before: <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
--           <h1 style="color:#0A1228;font-size:20px">New support ticket</h1>
--           <p style="color:#0A1228;font-size:15px;line-height:1.5"><strong>{{reporter_name}}</strong>
--             opened a ticket: <strong>{{subject}}</strong></p>
--           <p style="color:#8A9DC0;font-size:12px;margin-top:32px">Pickleball App Admin</p>
--         </div>
--
-- Rollback: restore the "Before" body above and
-- UPDATE public.email_templates SET layout = NULL, preheader = NULL
-- WHERE key = 'support_ticket_new';

UPDATE public.email_templates
SET
  html_body = '<h2>New support ticket</h2><p><strong>{{reporter_name}}</strong> opened a ticket: <strong>{{subject}}</strong></p>',
  preheader = '{{reporter_name}} opened: {{subject}}',
  layout = 'transactional'
WHERE key = 'support_ticket_new';
