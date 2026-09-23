-- The same honesty problem, the other way round.
--
-- Two senders EMAIL unconditionally while their catalog rows claimed only push
-- and in-app: expire_stale_holds (hold_expired) and issue_review_invitations_auto
-- (review_invite). The admin screen therefore understated what they do, and
-- unticking a channel that was not listed could not stop an email going out.
--
-- Both now list Email, and both senders check the channel before sending. That
-- makes the channel row a complete description of what an automation does,
-- which is the point of having a catalog.
--
-- Note for review_invite: unticking Email leaves the invitation issued and the
-- notification sent, with the link still valid. It stops the email copy, not
-- the invitation.

update public.notification_automations
   set channels = array_append(channels, 'email')
 where key in ('hold_expired', 'review_invite')
   and not ('email' = any(channels));

create or replace function public.expire_stale_holds()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  r          record;
  v_count    integer := 0;
  v_copy     record;
  v_name     text;
  v_email    text;
  v_tname    text;
  v_email_on boolean;
begin
  select 'email' = any(channels) into v_email_on
    from public.notification_automations where key = 'hold_expired';
  -- A missing catalog row must not silently stop a transactional email that
  -- has been sending since before the catalog existed.
  v_email_on := coalesce(v_email_on, true);

  for r in
    update public.registrations reg
       set status = 'expired_hold',
           hold_expired_at = now(),
           updated_at = now()
     where reg.status = 'held'
       and reg.hold_expires_at is not null
       and reg.hold_expires_at < now()
    returning reg.id, reg.player_id, reg.tournament_id
  loop
    v_count := v_count + 1;

    if r.player_id is not null then
      select t.name into v_tname from public.tournaments t where t.id = r.tournament_id;
      select coalesce(nullif(p.full_name, ''), 'there'), p.email
        into v_name, v_email
        from public.profiles p where p.id = r.player_id;

      select * into v_copy from private.render_automation(
        'hold_expired',
        jsonb_build_object(
          'tournament_name', coalesce(v_tname, 'your tournament'),
          'tournament_id',   r.tournament_id::text
        )
      );

      insert into public.notifications (user_id, type, title, body, link, idempotency_key)
      values (
        r.player_id,
        'hold_expired',
        coalesce(v_copy.title, 'Your hold has expired'),
        coalesce(v_copy.body,  'Your held spot was released.'),
        coalesce(v_copy.link,  '/tournament/' || r.tournament_id),
        'hold-expired/' || r.id
      )
      on conflict (idempotency_key) where idempotency_key is not null do nothing;

      if v_email_on and v_email is not null then
        perform public.fn_send_transactional_email(jsonb_build_object(
          'to', v_email,
          'templateKey', 'hold_expired',
          'variables', jsonb_build_object(
            'full_name',       v_name,
            'tournament_name', coalesce(v_tname, 'your tournament'),
            'link_url',        'https://pickleballapp.app/tournaments/' || r.tournament_id
          ),
          'idempotencyKey', 'hold-expired/' || r.id
        ));
      end if;
    end if;

    perform public.promote_next_waitlisted(r.tournament_id);
  end loop;

  return v_count;
end;
$$;

create or replace function public.issue_review_invitations_auto()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a          public.notification_automations%rowtype;
  v_lookback integer;
  v_email_on boolean;
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
  v_email_on := 'email' = any(a.channels);

  for r in
    select 'coach'::text subject_type, red.redeemed_by subject_id, red.buyer_id user_id
      from public.coach_voucher_redemptions red
     where red.redeemed_at <= now() - make_interval(hours => coalesce((a.timing ->> 'coach_delay_hours')::int, 3))
       and red.redeemed_at >  now() - make_interval(days  => v_lookback)
       and red.buyer_id is not null
       and red.redeemed_by is not null
       and red.redeemed_by <> red.buyer_id

    union all

    select 'facility', ci.facility_id, res.organizer_id
      from public.reservation_check_ins ci
      join public.reservations res on res.id = ci.reservation_id
     where ci.checked_in_at <= now() - make_interval(hours => coalesce((a.timing ->> 'facility_delay_hours')::int, 24))
       and ci.checked_in_at >  now() - make_interval(days  => v_lookback)
       and res.organizer_id is not null
       and ci.facility_id is not null

    union all

    select 'tournament', reg.tournament_id, u.user_id
      from public.registrations reg
      cross join lateral (values (reg.player_id), (reg.partner_id)) as u(user_id)
     where reg.checked_in_at is not null
       and reg.checked_in_at <= now() - make_interval(hours => coalesce((a.timing ->> 'tournament_delay_hours')::int, 24))
       and reg.checked_in_at >  now() - make_interval(days  => v_lookback)
       and u.user_id is not null
  loop
    if exists (
      select 1 from public.review_invitations i
       where i.user_id = r.user_id
         and i.subject_type = r.subject_type
         and i.subject_id = r.subject_id
         and i.revoked_at is null
    ) then
      continue;
    end if;

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

    if v_email_on then
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
    end if;

    -- Marking it sent is what writes the in-app notification and the push.
    update public.review_invitations set sent_at = now() where id = v_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
