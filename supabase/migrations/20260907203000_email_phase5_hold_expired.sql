-- Phase 5 migration (row 10/13): wrap hold_expired in the shared shell.
--
-- Before: <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
--           <h1 style="color:#0A1228;font-size:20px">Your hold has expired</h1>
--           <p style="color:#0A1228;font-size:15px;line-height:1.5">Hi {{full_name}}, your <strong>Hold
--             My Spot</strong> reservation for <strong>{{tournament_name}}</strong> has expired because
--             registration wasn't completed before the cutoff date.</p>
--           <p style="color:#0A1228;font-size:15px;line-height:1.5">Your hold fee has been forfeited
--             per our policy. Your spot has been offered to the next player on the waitlist.</p>
--           <p>If you'd still like to attend, you can <a href="{{link_url}}"
--             style="color:#C9A84C">join the waitlist</a>.</p>
--           <p style="color:#8A9DC0;font-size:12px;margin-top:32px">Pickleball App</p>
--         </div>
--
-- Dropped the hardcoded color:#C9A84C on the plain text link -- .dbp-body a
-- already sets a theme-aware link color (navy in light mode, gold in dark).
--
-- Rollback: restore the "Before" body above and
-- UPDATE public.email_templates SET layout = NULL WHERE key = 'hold_expired';
-- (preheader was already NULL before this migration.)

UPDATE public.email_templates
SET
  html_body = '<h2>Your hold has expired</h2><p>Hi {{full_name}}, your <strong>Hold My Spot</strong> reservation for <strong>{{tournament_name}}</strong> has expired because registration wasn''t completed before the cutoff date.</p><p>Your hold fee has been forfeited per our policy. Your spot has been offered to the next player on the waitlist.</p><p>If you''d still like to attend, you can <a href="{{link_url}}">join the waitlist</a>.</p>',
  preheader = 'Your hold expired and the spot moved to the next player.',
  layout = 'transactional'
WHERE key = 'hold_expired';
