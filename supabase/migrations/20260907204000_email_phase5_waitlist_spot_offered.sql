-- Phase 5 migration (row 11/13): wrap waitlist_spot_offered in the shared shell.
--
-- Before: <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
--           <h1 style="color:#0A1228;font-size:20px">A spot just opened up!</h1>
--           <p style="color:#0A1228;...">Hi {{full_name}}, a spot has opened in <strong>{{tournament_name}}</strong>
--             and you're next on the waitlist.</p>
--           <p style="color:#0A1228;..."><strong>You have 24 hours to complete your registration.</strong>
--             After that, the spot moves to the next player.</p>
--           <p><a href="{{link_url}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;
--             border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">Complete
--             Registration</a></p>
--           <p style="color:#8A9DC0;font-size:12px;margin-top:32px">Pickleball App · You're receiving
--             this because you joined the waitlist.</p>
--         </div>
--
-- CTA kept as an inline-styled anchor rather than routed through the shell's
-- ctaLabel/ctaUrl mechanism -- see "CTA decision" in the Phase 5 plan section
-- of EMAIL_NOTIFICATIONS_EXECUTION_PLAN.md. Dropped the trailing "you're
-- receiving this..." line along with the sign-off; low-value once the shell's
-- own footer/preferences link covers "why you got this."
--
-- Rollback: restore the "Before" body above and
-- UPDATE public.email_templates SET layout = NULL WHERE key = 'waitlist_spot_offered';
-- (preheader was already NULL before this migration.)

UPDATE public.email_templates
SET
  html_body = '<h2>A spot just opened up!</h2><p>Hi {{full_name}}, a spot has opened in <strong>{{tournament_name}}</strong> and you''re next on the waitlist.</p><p><strong>You have 24 hours to complete your registration.</strong> After that, the spot moves to the next player.</p><p><a href="{{link_url}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Complete Registration</a></p>',
  preheader = 'Your spot is ready — respond within 24 hours.',
  layout = 'transactional'
WHERE key = 'waitlist_spot_offered';
