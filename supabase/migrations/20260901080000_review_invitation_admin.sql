-- The admin side of invitation-only reviews.
--
-- 20260901070000 built issue_review_invitation but gave it no caller, so
-- nothing could ever send one. These two functions are what an admin screen
-- needs: find who is worth inviting, and record that the email went out.

-- Who could be invited, and has not been yet.
--
-- Without this an admin would have to know a user id AND a subject id before
-- they could invite anyone, which in practice means nobody gets invited. It
-- answers the question the screen actually asks: "who transacted recently and
-- has not been asked about it?"
--
-- SECURITY DEFINER over redemptions, reservations and registrations, so it is
-- admin-gated in the body. Already-invited and already-reviewed pairings are
-- filtered out rather than shown greyed: the list is a worklist.
create or replace function public.list_review_candidates(p_limit integer default 50)
returns table (
  user_id       uuid,
  user_name     text,
  user_email    text,
  subject_type  text,
  subject_id    uuid,
  subject_label text,
  occurred_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;

  return query
  with candidates as (
    -- Coach: the redemption is the proof the lesson was actually taken.
    select r.buyer_id as user_id, 'coach'::text as subject_type,
           r.redeemed_by as subject_id, r.redeemed_at as occurred_at
      from public.coach_voucher_redemptions r
     where r.redeemed_by is not null

    union all

    select r.buyer_id, 'coach_offer'::text, r.offer_id, r.redeemed_at
      from public.coach_voucher_redemptions r
     where r.offer_id is not null

    union all

    select res.organizer_id, 'facility'::text, res.facility_id, lower(res.time_range)
      from public.reservations res
     where res.status = 'confirmed'
       and lower(res.time_range) <= now()

    union all

    -- Both halves of a partnership played, so both may be asked.
    select unnest(array_remove(array[reg.player_id, reg.partner_id], null)),
           'tournament'::text, t.id, t.event_date::timestamptz
      from public.registrations reg
      join public.tournaments t on t.id = reg.tournament_id
     where reg.status in ('registered', 'checked_in', 'no_show', 'substitute')
       and t.event_date < current_date
  ),
  -- One row per person per subject: several bookings at the same facility earn
  -- one invitation, not one per visit.
  deduped as (
    select c.user_id, c.subject_type, c.subject_id, max(c.occurred_at) as occurred_at
      from candidates c
     where c.user_id is not null
     group by c.user_id, c.subject_type, c.subject_id
  )
  select d.user_id,
         p.full_name,
         p.email,
         d.subject_type,
         d.subject_id,
         coalesce(
           case d.subject_type
             when 'coach'       then (select sp.full_name from public.profiles sp where sp.id = d.subject_id)
             when 'coach_offer' then (select o.title from public.coach_offers o where o.id = d.subject_id)
             when 'facility'    then (select f.name from public.facilities f where f.id = d.subject_id)
             when 'tournament'  then (select t2.name from public.tournaments t2 where t2.id = d.subject_id)
           end,
           'Unknown') as subject_label,
         d.occurred_at
    from deduped d
    join public.profiles p on p.id = d.user_id
   where p.email is not null
     and not exists (
       select 1 from public.review_invitations i
        where i.user_id = d.user_id
          and i.subject_type = d.subject_type
          and i.subject_id = d.subject_id
          and i.revoked_at is null
     )
     and not exists (
       select 1 from public.reviews rv
        where rv.author_id = d.user_id
          and rv.subject_type = d.subject_type
          and rv.subject_id = d.subject_id
     )
   order by d.occurred_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$fn$;

-- Records that the invitation email was actually sent.
--
-- review_invitations has a SELECT policy and no UPDATE policy — writes go
-- through functions — so without this sent_at could never be set from a client
-- and would sit permanently null, making "did we already email this person?"
-- unanswerable.
create or replace function public.mark_review_invitation_sent(p_invitation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;

  -- coalesce: the FIRST send is the one worth dating. A resend of the same
  -- link should not make an old invitation look freshly issued.
  update public.review_invitations
     set sent_at = coalesce(sent_at, now())
   where id = p_invitation_id;
end;
$fn$;

revoke all on function public.list_review_candidates(integer) from public;
revoke all on function public.mark_review_invitation_sent(uuid) from public;
grant execute on function public.list_review_candidates(integer) to authenticated, service_role;
grant execute on function public.mark_review_invitation_sent(uuid) to authenticated, service_role;

comment on function public.list_review_candidates(integer) is
  'Admin worklist: people who transacted, have no live invitation and have not reviewed that subject yet.';
