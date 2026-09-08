-- Reviews — one 1-5 star mechanism across coaches, coach offers, facility
-- bookings and tournaments.
--
-- Spec §42/§43: a review must be tied to a verified transaction. That rule is
-- what makes a rating worth showing, so it is enforced in the database rather
-- than by whichever screen happens to submit — each subject type has its own
-- proof-of-transaction, checked server-side.
--
-- §48 says not to duplicate infrastructure per domain, so this is one table
-- rather than coach_reviews + facility_reviews + tournament_reviews.

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  subject_type  text not null check (subject_type in ('coach', 'coach_offer', 'facility', 'tournament')),
  subject_id    uuid not null,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  body          text check (body is null or length(body) <= 2000),

  -- What earned the right to review. Kept so a review can be traced to the
  -- transaction that justified it, and so revoking that transaction can find
  -- its reviews.
  source_type   text not null check (source_type in ('coach_voucher_redemption', 'reservation', 'tournament_registration')),
  source_id     uuid not null,

  -- §42: the coach may respond publicly. Stored here rather than as a second
  -- review so a response can never be mistaken for a rating.
  response_body text check (response_body is null or length(response_body) <= 2000),
  response_at   timestamptz,
  response_by   uuid references public.profiles(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One review per person per subject. A second visit does not buy a second vote.
create unique index if not exists reviews_author_subject_key
  on public.reviews (author_id, subject_type, subject_id);
create index if not exists reviews_subject_idx
  on public.reviews (subject_type, subject_id, created_at desc);

-- Returns the transaction entitling this user to review this subject, or
-- nothing. SECURITY DEFINER because it reads registrations, reservations and
-- redemptions — tables a reviewer has no general right to query.
--
-- NOTE: reservation_status is held/confirmed/cancelled/expired. There is no
-- 'completed' value; a confirmed booking whose slot has started is the "you
-- were actually there" signal.
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

  -- §42 requires a completed REDEMPTION, not merely a purchase: buying a
  -- lesson and never taking it earns no opinion of the coaching.
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

create or replace function public.can_review(p_subject_type text, p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from public.review_eligibility(p_subject_type, p_subject_id, auth.uid()));
$fn$;

create or replace function public.submit_review(
  p_subject_type text,
  p_subject_id uuid,
  p_rating smallint,
  p_body text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
  v_src   record;
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  select * into v_src from public.review_eligibility(p_subject_type, p_subject_id, v_actor);
  if not found then
    raise exception 'not_eligible';
  end if;

  insert into public.reviews (subject_type, subject_id, author_id, rating, body, source_type, source_id)
  values (p_subject_type, p_subject_id, v_actor, p_rating, nullif(trim(coalesce(p_body, '')), ''),
          v_src.source_type, v_src.source_id)
  on conflict (author_id, subject_type, subject_id) do update
    set rating = excluded.rating,
        body = excluded.body,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$fn$;

alter table public.reviews enable row level security;

drop policy if exists "reviews: public read" on public.reviews;
create policy "reviews: public read" on public.reviews for select using (true);

drop policy if exists "reviews: author delete own" on public.reviews;
create policy "reviews: author delete own" on public.reviews for delete
  using (author_id = (select auth.uid()) or public.is_admin());

-- No INSERT or UPDATE policy, deliberately: writes go only through
-- submit_review, which is where eligibility is proven. A direct insert would
-- be a review with nothing behind it.

create or replace view public.v_review_summary
with (security_invoker = true) as
select subject_type, subject_id,
       round(avg(rating)::numeric, 2) as average_rating,
       count(*)::integer               as review_count
  from public.reviews
 group by subject_type, subject_id;

grant select on public.v_review_summary to anon, authenticated;
revoke all on function public.submit_review(text, uuid, smallint, text) from public;
grant execute on function public.submit_review(text, uuid, smallint, text) to authenticated;
grant execute on function public.can_review(text, uuid) to authenticated;

comment on table public.reviews is
  'One 1-5 star mechanism for coaches, coach offers, facilities and tournaments. Every row is tied to a verified transaction (spec §43); writes only via submit_review.';
