-- Repairs the email templates that Phase 0's unresolved-variable guard exposed.
--
-- Two problems, both predating the guard:
--
-- 1. {{sponsor_logos}} appears in 10 of 21 templates but NOTHING server-side
--    ever supplied it. The only implementation is renderEmailPreview() in
--    web/src/app/admin/page.tsx - admin preview only, never sending, and it
--    emits display:flex, which Outlook does not support anyway. email_sponsors
--    has 0 rows in production, so the token has only ever rendered as nothing.
--    Removed. If sponsors become real, the shell footer is the place for them:
--    one implementation instead of a token duplicated across 10 bodies.
--
-- 2. registration_confirmed and director_approved referenced variables their
--    DB triggers never pass. Before the guard they delivered with raw {{tokens}}
--    visible; after it they returned 422 and delivered nothing. Their bodies are
--    rewritten to use only what fn_notify_registration and
--    fn_notify_director_status actually send.
--
-- The new bodies are STRUCTURE ONLY - no colours, no wrapper div, no sign-off.
-- The shell (supabase/functions/_shared/email-shell.ts) owns all of that, and a
-- body carrying color:#0A1228 renders navy-on-navy once dark mode applies. This
-- is the shape every template needs for Phase 5, so these two need no rework.
--
-- Until the Phase 4 wrap gate ships these two send unwrapped, so they will look
-- plain. Plain and correct beats the current state, which is not sending at all.

-- ── 1. Strip the token everywhere. Idempotent. ───────────────────────────────
UPDATE public.email_templates
   SET html_body = replace(html_body, '{{sponsor_logos}}', ''),
       updated_at = now()
 WHERE html_body LIKE '%{{sponsor_logos}}%';

-- ── 2a. registration_confirmed — trigger passes only tournament_name ─────────
UPDATE public.email_templates
   SET html_body =
         '<h2>You''re registered</h2>'
         '<p>Your spot in <strong>{{tournament_name}}</strong> is confirmed. See you on the court.</p>'
         '<p>Your check-in code and full event details are in the app.</p>',
       variables = ARRAY['tournament_name'],
       updated_at = now()
 WHERE key = 'registration_confirmed';

-- ── 2b. director_approved — trigger passes only full_name ────────────────────
UPDATE public.email_templates
   SET html_body =
         '<h2>You''re an approved director</h2>'
         '<p>Hi {{full_name}},</p>'
         '<p>Your director account is approved. You can now create and manage '
         'tournaments on Pickleball App.</p>',
       variables = ARRAY['full_name'],
       updated_at = now()
 WHERE key = 'director_approved';

-- ── Verification ─────────────────────────────────────────────────────────────
-- Expect 0 rows from each:
--
--   select key from public.email_templates
--    where html_body like '%{{sponsor_logos}}%';
--
--   -- every token in a body must be declared in variables
--   select key
--     from public.email_templates t
--    cross join lateral regexp_matches(t.html_body || ' ' || t.subject,
--                                      '\{\{(\w+)\}\}', 'g') as m(tok)
--    where not (m.tok[1] = any(coalesce(t.variables, '{}')))
--    group by key;
