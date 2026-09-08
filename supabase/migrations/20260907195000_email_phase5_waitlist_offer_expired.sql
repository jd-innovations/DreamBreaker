-- Phase 5 migration (row 6/13): wrap waitlist_offer_expired in the shared shell.
--
-- Before: <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
--           <h1 style="color:#0A1228;font-size:20px">Waitlist offer expired</h1>
--           <p style="color:#0A1228;font-size:15px;line-height:1.5">Hi {{full_name}}, your 24-hour
--             window to register for <strong>{{tournament_name}}</strong> has passed. Your spot has
--             been offered to the next player on the waitlist.</p>
--           <p style="color:#8A9DC0;font-size:12px;margin-top:32px">Pickleball App</p>
--         </div>
--
-- Rollback: restore the "Before" body above and
-- UPDATE public.email_templates SET layout = NULL, preheader = NULL
-- WHERE key = 'waitlist_offer_expired';

UPDATE public.email_templates
SET
  html_body = '<h2>Waitlist offer expired</h2><p>Hi {{full_name}}, your 24-hour window to register for <strong>{{tournament_name}}</strong> has passed. Your spot has been offered to the next player on the waitlist.</p>',
  preheader = 'Your 24-hour window to register has passed.',
  layout = 'transactional'
WHERE key = 'waitlist_offer_expired';
