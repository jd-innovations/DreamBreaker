-- Phase 5 migration (row 13/13, last one): wrap review_invite in the shared
-- shell. Also fixes the same dead-class="btn" bug as facility_manager_approved,
-- and drops a hardcoded color:#6B7280 on the fine print (font-size kept, only
-- the color is removed -- the shell owns text color).
--
-- Before: <p>Hi {{first_name}},</p><p>Thanks for using Pickleball App. How was
--           <strong>{{subject_label}}</strong>?</p><p>It takes about ten seconds, and it helps the
--           next player know what to expect.</p><p><a href="{{review_url}}" class="btn">Leave a
--           rating</a></p><p style="font-size:13px;color:#6B7280">This link is just for you and
--           expires in 60 days.</p>
--
-- Rollback: restore the "Before" body above and
-- UPDATE public.email_templates SET layout = NULL WHERE key = 'review_invite';
-- (preheader already existed pre-Phase-5, unchanged.)

UPDATE public.email_templates
SET
  html_body = '<p>Hi {{first_name}},</p><p>Thanks for using Pickleball App. How was <strong>{{subject_label}}</strong>?</p><p>It takes about ten seconds, and it helps the next player know what to expect.</p><p><a href="{{review_url}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Leave a rating</a></p><p style="font-size:13px;">This link is just for you and expires in 60 days.</p>',
  layout = 'transactional'
WHERE key = 'review_invite';
