-- Review invitations, issued automatically from VERIFIED participation.
--
-- Until now every invitation was issued by hand from /admin/reviews, which
-- does not scale past a handful of events. Three signals prove someone
-- actually turned up, and all three come from a scanned QR code:
--
--   coach       coach_voucher_redemptions   — the coach scanned the voucher
--   facility    reservation_check_ins       — the facility scanned them in
--   tournament  registrations.checked_in_at — checked in at the draw
--
-- ── Stricter than review_eligibility, on purpose ────────────────────────────
-- review_eligibility() lets a facility be reviewed after any confirmed
-- reservation whose start time has passed, and a tournament after any
-- registration once the date is gone — including 'no_show'. That is a
-- reasonable OUTER bound for an admin issuing by hand (a scanner failed,
-- someone clearly played), but too loose to automate: it would invite people
-- who booked a court and never came. This job requires the scan. Eligibility
-- is deliberately left untouched, so the manual override still works, and it
-- is still consulted here for provenance — an auto-issued invitation is
-- indistinguishable from a hand-issued one.
--
-- ── Delays ──────────────────────────────────────────────────────────────────
-- Coaching is asked soon after the lesson, while it is fresh (3h). Facility
-- and tournament wait a day: a court session or a draw is not over when the
-- scan happens, and "how was it?" mid-event is a poor question. All three, and
-- the lookback window, live in the review_invite automation's timing.
--
-- ── One ask per lesson ──────────────────────────────────────────────────────
-- A redemption makes the player eligible to review the COACH and the OFFER.
-- Only the coach is invited automatically (owner decision 2026-09-23): coach
-- reputation is what buyers read, and two pushes for one lesson is how people
-- learn to ignore notifications. Offer reviews remain issuable by hand.
--
-- ── What one invitation does ────────────────────────────────────────────────
-- Issue token -> send the branded review_invite email -> mark sent, which
-- fires trg_notify_review_invitation (20260923190000) and writes the in-app
-- notification and push. The same three steps, and the same idempotency keys,
-- as the admin screen.
--
-- Dry runs against real rows: a tournament check-in 2 days old issued one
-- invitation, emailed and notified, and nothing on a second run; the same
-- registration with no check-in issued nothing; a check-in one hour old was
-- correctly too soon; a coaching redemption 4 hours old invited the coach and
-- NOT the offer; a facility scan 2 days old invited the facility.

update public.notification_automations set
  timing = '{"coach_delay_hours": 3, "facility_delay_hours": 24, "tournament_delay_hours": 24, "lookback_days": 14}'::jsonb,
  description = 'Invites a review after VERIFIED participation: a scanned coaching voucher, a facility check-in, or a tournament check-in. Stricter than review_eligibility, which stays as the manual override. Issues the token, emails it and writes the notification.'
where key = 'review_invite';

create or replace function public.issue_review_invitations_auto()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a          public.notification_automations%rowtype;
  v_lookback integer;
  r          record;
  v_src      record;
  v_token    text;
  v_id       uuid;
  v_label    text;
  v_email    text;
  v_name     text;
  v_count    integer := 0;
begin
  select * into a from public.notification_automations where key = 'review_invite';
  if not found or not a.enabled then
    return 0;
  end if;

  v_lookback := coalesce((a.timing ->> 'lookback_days')::int, 14);

  for r in
    -- Coaching: the coach scanned the voucher.
    select 'coach'::text subject_type, red.redeemed_by subject_id, red.buyer_id user_id
      from public.coach_voucher_redemptions red
     where red.redeemed_at <= now() - make_interval(hours => coalesce((a.timing ->> 'coach_delay_hours')::int, 3))
       and red.redeemed_at >  now() - make_interval(days  => v_lookback)
       and red.buyer_id is not null
       and red.redeemed_by is not null
       and red.redeemed_by <> red.buyer_id

    union all

    -- Facility: the facility scanned them in.
    select 'facility', ci.facility_id, res.organizer_id
      from public.reservation_check_ins ci
      join public.reservations res on res.id = ci.reservation_id
     where ci.checked_in_at <= now() - make_interval(hours => coalesce((a.timing ->> 'facility_delay_hours')::int, 24))
       and ci.checked_in_at >  now() - make_interval(days  => v_lookback)
       and res.organizer_id is not null
       and ci.facility_id is not null

    union all

    -- Tournament: checked in at the draw. Partners count too — both played.
    select 'tournament', reg.tournament_id, u.user_id
      from public.registrations reg
      cross join lateral (values (reg.player_id), (reg.partner_id)) as u(user_id)
     where reg.checked_in_at is not null
       and reg.checked_in_at <= now() - make_interval(hours => coalesce((a.timing ->> 'tournament_delay_hours')::int, 24))
       and reg.checked_in_at >  now() - make_interval(days  => v_lookback)
       and u.user_id is not null
  loop
    -- Already invited for this subject, sent or not, used or not? Leave it.
    if exists (
      select 1 from public.review_invitations i
       where i.user_id = r.user_id
         and i.subject_type = r.subject_type
         and i.subject_id = r.subject_id
         and i.revoked_at is null
    ) then
      continue;
    end if;

    -- Provenance from the same function the admin path uses. It also refuses
    -- anything eligibility would refuse outright.
    select * into v_src from public.review_eligibility(r.subject_type, r.subject_id, r.user_id);
    if not found then
      continue;
    end if;

    select p.email, p.full_name into v_email, v_name
      from public.profiles p where p.id = r.user_id and p.deleted_at is null;
    if v_email is null then
      continue;
    end if;

    v_label := case r.subject_type
      when 'facility'   then (select f.name from public.facilities f where f.id = r.subject_id)
      when 'tournament' then (select t.name from public.tournaments t where t.id = r.subject_id)
      when 'coach'      then (select p.full_name from public.profiles p where p.id = r.subject_id)
      else null
    end;

    v_token := public.generate_review_token();
    insert into public.review_invitations
      (token, user_id, subject_type, subject_id, source_type, source_id, issued_by)
    values (v_token, r.user_id, r.subject_type, r.subject_id, v_src.source_type, v_src.source_id, null)
    returning id into v_id;

    perform public.fn_send_transactional_email(jsonb_build_object(
      'to', v_email,
      'templateKey', 'review_invite',
      'variables', jsonb_build_object(
        'first_name',    coalesce(nullif(split_part(coalesce(v_name, ''), ' ', 1), ''), 'there'),
        'subject_label', coalesce(v_label, 'your last session'),
        'review_url',    'https://pickleballapp.app/review/' || v_token
      ),
      'idempotencyKey', 'review_invite:' || v_id
    ));

    -- Marking it sent is what writes the in-app notification and the push.
    update public.review_invitations set sent_at = now() where id = v_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.issue_review_invitations_auto() is
  'Issues review invitations from scan-verified participation (coach '
  'redemption, facility check-in, tournament check-in). Stricter than '
  'review_eligibility, which remains the manual override. No-op while the '
  'review_invite automation is disabled.';

revoke all on function public.issue_review_invitations_auto() from public, anon, authenticated;

select cron.schedule('auto-review-invitations', '20 * * * *',
                     $$select public.issue_review_invitations_auto();$$);
