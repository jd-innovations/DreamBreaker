-- Phase 5 migration (row 8/13): wrap support_ticket_reply in the shared shell.
--
-- Before: <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
--           <h1 style="color:#0A1228;font-size:20px">You have a reply</h1>
--           <p style="color:#0A1228;font-size:15px;line-height:1.5">A Pickleball App team member
--             replied to <strong>{{subject}}</strong>:</p>
--           <p style="color:#0A1228;font-size:15px;line-height:1.5;background:#F3F6FC;padding:12px;
--             border-radius:8px">{{message_preview}}</p>
--           <p style="color:#8A9DC0;font-size:12px;margin-top:32px">Pickleball App</p>
--         </div>
--
-- The old quote box used a fixed light-blue fill (background:#F3F6FC). In dark
-- mode the shell forces body text white while the fill stays light, which
-- would render white-on-light-blue -- unreadable. Replaced with a border-left
-- accent (no fill), which is legible in both themes.
--
-- Rollback: restore the "Before" body above and
-- UPDATE public.email_templates SET layout = NULL, preheader = NULL
-- WHERE key = 'support_ticket_reply';

UPDATE public.email_templates
SET
  html_body = '<h2>You have a reply</h2><p>A Pickleball App team member replied to <strong>{{subject}}</strong>:</p><p style="border-left:3px solid #C9A84C;padding-left:12px;">{{message_preview}}</p>',
  preheader = 'New reply on: {{subject}}',
  layout = 'transactional'
WHERE key = 'support_ticket_reply';
