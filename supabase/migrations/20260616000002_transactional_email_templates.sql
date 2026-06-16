-- =============================================================================
-- DreamBreaker PB — Tier-1 Transactional Email Templates
-- Migration: 20260616000002_transactional_email_templates
--
-- Adds 8 player-facing transactional templates matching the existing house
-- style (minimal HTML, {{var}} interpolation, trailing {{sponsor_logos}} ad
-- slot). Money emails (receipt, refund) intentionally omit the sponsor slot.
-- Sending is handled separately — these just author/store the content.
-- =============================================================================

insert into public.email_templates (key, name, subject, html_body, variables, enabled) values

-- 1. Payment receipt (money — no sponsor slot)
(
  'payment_receipt',
  'Payment Receipt',
  'Receipt for "{{tournament_name}}" — {{amount}}',
  '<p>Hi {{first_name}},</p><p>Thanks for your payment. Here is your receipt:</p><p><strong>{{tournament_name}}</strong><br/>Date: {{event_date}}<br/>Amount paid: <strong>{{amount}}</strong></p><p><a href="{{link}}">View registration</a></p><p>Keep this email for your records.</p>',
  array['first_name','tournament_name','event_date','amount','link'],
  true
),

-- 2. Refund processed (money — no sponsor slot)
(
  'refund_processed',
  'Refund Processed',
  'Your refund for "{{tournament_name}}" is on its way',
  '<p>Hi {{first_name}},</p><p>We''ve processed a refund of <strong>{{amount}}</strong> for <strong>{{tournament_name}}</strong>.</p><p>Refunds typically take 5–10 business days to appear on your statement, depending on your bank.</p>',
  array['first_name','tournament_name','amount'],
  true
),

-- 3. Waitlist added (sponsor slot)
(
  'waitlist_added',
  'Added to Waitlist',
  'You''re on the waitlist for "{{tournament_name}}"',
  '<p>Hi {{first_name}},</p><p><strong>{{tournament_name}}</strong> is currently full, so we''ve added you to the waitlist at <strong>position {{position}}</strong>.</p><p>We''ll email you the moment a spot opens up. No action needed for now.</p><p><a href="{{link}}">View tournament</a></p>{{sponsor_logos}}',
  array['first_name','tournament_name','position','link'],
  true
),

-- 4. Waitlist promoted (sponsor slot)
(
  'waitlist_promoted',
  'Waitlist Spot Available',
  'A spot opened up in "{{tournament_name}}"',
  '<p>Hi {{first_name}},</p><p>Good news — a spot just opened in <strong>{{tournament_name}}</strong> and it''s yours to claim.</p><p>Please complete your registration by <strong>{{deadline}}</strong> or the spot moves to the next player.</p><p><a href="{{link}}">Claim your spot</a></p>{{sponsor_logos}}',
  array['first_name','tournament_name','deadline','link'],
  true
),

-- 5. Event reminder (sponsor slot)
(
  'event_reminder',
  'Event Reminder',
  'Reminder: "{{tournament_name}}" is on {{event_date}}',
  '<p>Hi {{first_name}},</p><p>Just a reminder that <strong>{{tournament_name}}</strong> is coming up on <strong>{{event_date}}</strong>.</p><p>Venue: {{venue_name}}</p><p>Make sure your paddle is ready and arrive early for check-in.</p><p><a href="{{link}}">View details</a></p>{{sponsor_logos}}',
  array['first_name','tournament_name','event_date','venue_name','link'],
  true
),

-- 6. Check-in open (sponsor slot)
(
  'checkin_open',
  'Check-In Open',
  'Check-in is open for "{{tournament_name}}"',
  '<p>Hi {{first_name}},</p><p>Check-in is now open for <strong>{{tournament_name}}</strong>. Please check in to confirm your spot in the draw.</p><p><a href="{{link}}">Check in now</a></p>{{sponsor_logos}}',
  array['first_name','tournament_name','link'],
  true
),

-- 7. New mutual match (sponsor slot)
(
  'new_match',
  'New Partner Match',
  'You matched with {{match_name}} on DreamBreaker',
  '<p>Hi {{first_name}},</p><p>You and <strong>{{match_name}}</strong> both liked each other — you''re a match! Start a conversation and find your next tournament partner.</p><p><a href="{{link}}">Say hello</a></p>{{sponsor_logos}}',
  array['first_name','match_name','link'],
  true
),

-- 8. Results ready (sponsor slot)
(
  'results_ready',
  'Results Are In',
  'Results for "{{tournament_name}}" are in',
  '<p>Hi {{first_name}},</p><p>The results for <strong>{{tournament_name}}</strong> are in. You finished <strong>{{placement}}</strong>. Nice work out there!</p><p><a href="{{link}}">See full standings</a></p>{{sponsor_logos}}',
  array['first_name','tournament_name','placement','link'],
  true
)

on conflict (key) do nothing;
