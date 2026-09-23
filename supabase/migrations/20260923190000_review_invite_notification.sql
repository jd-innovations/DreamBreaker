-- Review invitations, as a notification alongside the email.
--
-- ── When it fires ───────────────────────────────────────────────────────────
-- Reviews are invitation-only and admin-issued (/admin/reviews: issue the
-- token, send the email, mark it sent). The notification hangs off sent_at
-- becoming set — the exact moment the email went — not issuance, because
-- issue_review_invitation is idempotent and returns the existing row on a
-- resend. Pressing the button twice therefore produces one notification, which
-- matches the email's own idempotency key.
--
-- ── The link is the whole point ─────────────────────────────────────────────
-- /review/<token> is a real deep-link root, so a tap opens the review form
-- itself rather than the app's home screen. This is the only automation whose
-- destination is a single-use URL. The token belongs to the recipient and the
-- notification is written only for that same user_id, so it is not a leak —
-- and resolve_review_invitation refuses a token that is not theirs anyway.
--
-- ── What it is called ───────────────────────────────────────────────────────
-- subject_label is resolved here because the trigger has only ids, and "How
-- was it?" would be useless. Each of the four subject types is looked up in
-- its own table; anything unresolvable falls back to wording that still reads.
--
-- Dry runs: issuing without sending wrote nothing; marking sent wrote one,
-- linking at the token; a resend wrote no second copy; facility, tournament
-- and coach invitations each named the right subject; a revoked invitation
-- stayed silent.

update public.notification_automations set
  title_template = 'How was {{subject_label}}?',
  body_template  = 'Ten seconds of your time helps the next player know what to expect.',
  link_template  = '/review/{{token}}',
  wired = true
where key = 'review_invite';

create or replace function public.fn_notify_review_invitation()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_label text;
  v_copy  record;
begin
  -- Only the transition into "sent", never a resend or any other update.
  if new.sent_at is null or (tg_op = 'UPDATE' and old.sent_at is not null) then
    return new;
  end if;

  if new.revoked_at is not null or new.used_at is not null then
    return new;
  end if;

  v_label := case new.subject_type
    when 'facility'    then (select f.name from public.facilities f where f.id = new.subject_id)
    when 'tournament'  then (select t.name from public.tournaments t where t.id = new.subject_id)
    when 'coach'       then (select p.full_name from public.profiles p where p.id = new.subject_id)
    when 'coach_offer' then (select o.title from public.coach_offers o where o.id = new.subject_id)
    else null
  end;

  select * into v_copy from private.render_automation('review_invite', jsonb_build_object(
    'subject_label', coalesce(v_label, 'your last session'),
    'token',         new.token
  ));

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (new.user_id, 'review_invite',
          coalesce(v_copy.title, 'How was ' || coalesce(v_label, 'your last session') || '?'),
          coalesce(v_copy.body, 'Leave a quick review.'),
          coalesce(v_copy.link, '/review/' || new.token),
          'review-invite/' || new.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_review_invitation on public.review_invitations;
create trigger trg_notify_review_invitation
  after insert or update of sent_at on public.review_invitations
  for each row execute function public.fn_notify_review_invitation();
