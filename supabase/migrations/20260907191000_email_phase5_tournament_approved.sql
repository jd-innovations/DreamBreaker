-- Phase 5 migration (EMAIL_NOTIFICATIONS_EXECUTION_PLAN.md, Phase 5, row 5/13):
-- wrap tournament_approved in the shared email shell.
--
-- Strips the legacy wrapper <div style="font-family:sans-serif;...">, the
-- hardcoded color:#0A1228/color:#8A9DC0 (would render invisible in dark mode --
-- the shell owns text color), and the "Pickleball App" sign-off (the shell's
-- footer already brands every send). The h1 headline is normalized to a plain
-- h2, not deleted -- matches the four templates already repaired during the
-- 2026-08-21 incident, which kept their headline.
--
-- Before: <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
--           <h1 style="color:#0A1228;font-size:20px">Tournament approved</h1>
--           <p style="color:#0A1228;font-size:15px;line-height:1.5">
--             <strong>{{tournament_name}}</strong> is now live and open for registration.
--           </p>
--           <p style="color:#8A9DC0;font-size:12px;margin-top:32px">Pickleball App</p>
--         </div>
--
-- Rollback: restore the "Before" body above and
-- UPDATE public.email_templates SET layout = NULL, preheader = NULL
-- WHERE key = 'tournament_approved';

UPDATE public.email_templates
SET
  html_body = '<h2>Tournament approved</h2><p><strong>{{tournament_name}}</strong> is now live and open for registration.</p>',
  preheader = '{{tournament_name}} is live and open for registration.',
  layout = 'transactional'
WHERE key = 'tournament_approved';
