-- reservation_status has no 'completed' value — it is held/confirmed/cancelled/
-- expired. A confirmed booking whose slot has started is the real "you were
-- there" signal.
create or replace function public.review_eligibility(
  p_subject_type text,
  p_subject_id uuid,
  p_user_id uuid
)
returns table (source_type text, source_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if p_user_id is null then
    return;
  end if;

  if p_subject_type = 'coach' then
    return query
      select 'coach_voucher_redemption'::text, r.id
        from public.coach_voucher_redemptions r
       where r.buyer_id = p_user_id and r.redeemed_by = p_subject_id
       order by r.redeemed_at desc limit 1;
    return;
  end if;

  if p_subject_type = 'coach_offer' then
    return query
      select 'coach_voucher_redemption'::text, r.id
        from public.coach_voucher_redemptions r
       where r.buyer_id = p_user_id and r.offer_id = p_subject_id
       order by r.redeemed_at desc limit 1;
    return;
  end if;

  if p_subject_type = 'facility' then
    return query
      select 'reservation'::text, res.id
        from public.reservations res
       where res.organizer_id = p_user_id
         and res.facility_id = p_subject_id
         and res.status = 'confirmed'
         and lower(res.time_range) <= now()
       order by lower(res.time_range) desc limit 1;
    return;
  end if;

  if p_subject_type = 'tournament' then
    return query
      select 'tournament_registration'::text, reg.id
        from public.registrations reg
        join public.tournaments t on t.id = reg.tournament_id
       where t.id = p_subject_id
         and (reg.player_id = p_user_id or reg.partner_id = p_user_id)
         and reg.status in ('registered', 'checked_in', 'no_show', 'substitute')
         and t.event_date < current_date
       order by reg.created_at desc limit 1;
    return;
  end if;
end;
$fn$;
