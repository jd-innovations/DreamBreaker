-- Brand the last six legacy templates (owner decision 2026-09-22: convert all
-- six rather than retire the two duplicates; payment_receipt stays a separate
-- email from registration_confirmed).
--
-- None of these is sent by anything yet — no trigger, cron or function names
-- them — so this changes no mail anyone receives today. It means that whatever
-- later wires one up gets the branded shell, not a bare body.
--
-- Same shape as the Phase 5 rows (20260907*): body keeps its copy and its
-- variables EXACTLY (a caller's contract is the variable set), gains an <h2>,
-- the CTA link becomes the gold pill, a preheader is added using only variables
-- the body already needs (so it can never be the unresolved one), and layout is
-- set to 'transactional' — no unsubscribe footer, which is right for a receipt.
--
-- Rollback: UPDATE ... SET layout = NULL, preheader = NULL and restore each
-- "Before" body below.
--
-- Before bodies:
--   checkin_open         <p>Hi {{first_name}},</p><p>Check-in is now open for <strong>{{tournament_name}}</strong>. Please check in to confirm your spot in the draw.</p><p><a href="{{link}}">Check in now</a></p>
--   event_reminder       <p>Hi {{first_name}},</p><p>Just a reminder that <strong>{{tournament_name}}</strong> is coming up on <strong>{{event_date}}</strong>.</p><p>Venue: {{venue_name}}</p><p>Make sure your paddle is ready and arrive early for check-in.</p><p><a href="{{link}}">View details</a></p>
--   payment_receipt      <p>Hi {{first_name}},</p><p>Thanks for your payment. Here is your receipt:</p><p><strong>{{tournament_name}}</strong><br/>Date: {{event_date}}<br/>Amount paid: <strong>{{amount}}</strong></p><p><a href="{{link}}">View registration</a></p><p>Keep this email for your records.</p>
--   results_ready        <p>Hi {{first_name}},</p><p>The results for <strong>{{tournament_name}}</strong> are in. You finished <strong>{{placement}}</strong>. Nice work out there!</p><p><a href="{{link}}">See full standings</a></p>
--   tournament_published <p>Hi {{first_name}},</p><p>Great news — <strong>{{tournament_name}}</strong> has been approved and is now open for registration.</p><p><a href="{{link}}">View your tournament</a></p>
--   waitlist_promoted    <p>Hi {{first_name}},</p><p>Good news — a spot just opened in <strong>{{tournament_name}}</strong> and it's yours to claim.</p><p>Please complete your registration by <strong>{{deadline}}</strong> or the spot moves to the next player.</p><p><a href="{{link}}">Claim your spot</a></p>

UPDATE public.email_templates SET
  html_body = '<h2>Check-in is open</h2><p>Hi {{first_name}},</p><p>Check-in is now open for <strong>{{tournament_name}}</strong>. Please check in to confirm your spot in the draw.</p><p><a href="{{link}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Check in now</a></p>',
  preheader = 'Check in to confirm your spot in {{tournament_name}}.',
  layout = 'transactional'
WHERE key = 'checkin_open';

UPDATE public.email_templates SET
  html_body = '<h2>Coming up soon</h2><p>Hi {{first_name}},</p><p>Just a reminder that <strong>{{tournament_name}}</strong> is coming up on <strong>{{event_date}}</strong>.</p><p>Venue: {{venue_name}}</p><p>Make sure your paddle is ready and arrive early for check-in.</p><p><a href="{{link}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">View details</a></p>',
  preheader = '{{tournament_name}} is on {{event_date}}.',
  layout = 'transactional'
WHERE key = 'event_reminder';

UPDATE public.email_templates SET
  html_body = '<h2>Payment received</h2><p>Hi {{first_name}},</p><p>Thanks for your payment. Here is your receipt:</p><p><strong>{{tournament_name}}</strong><br/>Date: {{event_date}}<br/>Amount paid: <strong>{{amount}}</strong></p><p><a href="{{link}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">View registration</a></p><p>Keep this email for your records.</p>',
  preheader = 'Your receipt for {{tournament_name}}: {{amount}}.',
  layout = 'transactional'
WHERE key = 'payment_receipt';

UPDATE public.email_templates SET
  html_body = '<h2>Results are in</h2><p>Hi {{first_name}},</p><p>The results for <strong>{{tournament_name}}</strong> are in. You finished <strong>{{placement}}</strong>. Nice work out there!</p><p><a href="{{link}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">See full standings</a></p>',
  preheader = 'See how you finished in {{tournament_name}}.',
  layout = 'transactional'
WHERE key = 'results_ready';

UPDATE public.email_templates SET
  html_body = '<h2>Your tournament is live</h2><p>Hi {{first_name}},</p><p>Great news — <strong>{{tournament_name}}</strong> has been approved and is now open for registration.</p><p><a href="{{link}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">View your tournament</a></p>',
  preheader = '{{tournament_name}} is live and open for registration.',
  layout = 'transactional'
WHERE key = 'tournament_published';

UPDATE public.email_templates SET
  html_body = '<h2>A spot opened up</h2><p>Hi {{first_name}},</p><p>Good news — a spot just opened in <strong>{{tournament_name}}</strong> and it''s yours to claim.</p><p>Please complete your registration by <strong>{{deadline}}</strong> or the spot moves to the next player.</p><p><a href="{{link}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Claim your spot</a></p>',
  preheader = 'Claim your spot in {{tournament_name}} by {{deadline}}.',
  layout = 'transactional'
WHERE key = 'waitlist_promoted';
