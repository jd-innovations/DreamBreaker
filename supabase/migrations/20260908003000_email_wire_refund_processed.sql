-- Wire refund_processed. Hook: web/src/app/api/stripe/webhooks/route.ts's
-- charge.refunded handler -- the authoritative point a refund is CONFIRMED
-- complete (settles the refunds row to 'succeeded'), not cancel-registration's
-- submitRefund() which only marks 'submitted'. Scoped to tournament-purpose
-- payments only; a reservation/coach-offer refund has no matching template
-- copy today and is left alone rather than sent mismatched content.
--
-- Body rewritten from the dead {{first_name}} to {{full_name}}.

UPDATE public.email_templates
SET
  html_body = '<p>Hi {{full_name}},</p><p>We''ve processed a refund of <strong>{{amount}}</strong> for <strong>{{tournament_name}}</strong>.</p><p>Refunds typically take 5–10 business days to appear on your statement, depending on your bank.</p>',
  variables = ARRAY['full_name', 'tournament_name', 'amount'],
  preheader = 'Your refund of {{amount}} is on its way.',
  layout = 'transactional'
WHERE key = 'refund_processed';
