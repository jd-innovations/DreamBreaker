-- Reviews become invitation-only, delivered by email.
--
-- Three requirements settle into one mechanism: reviews arrive via an emailed
-- link, and issuing that link IS the control over who may write. Having
-- transacted now makes someone ELIGIBLE to be invited; the invitation grants
-- the right.
--
-- The transaction check stays as a floor rather than being replaced, and is
-- re-checked at submit as well as at issue — a redemption reversed or a booking
-- cancelled between the email and the reply should not still buy a review
-- (spec §43). An admin cannot manufacture one either: issuing to an ineligible
-- pairing is refused.
--
-- Ratings are hidden by default. reviews_display_enabled starts 'false' and
-- reviews_display_min_count is 3, so nothing shows until there is enough data
-- for an average to mean anything — one opinion is not an average.

create table if not exists public.review_invitations (
  id            uuid primary key default gen_random_uuid(),
  token         text not null,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  subject_type  text not null check (subject_type in ('coach', 'coach_offer', 'facility', 'tournament')),
  subject_id    uuid not null,
  -- The transaction that made this person eligible, captured at issue time so
  -- the invitation carries its own justification.
  source_type   text not null,
  source_id     uuid not null,
  issued_by     uuid references public.profiles(id) on delete set null,
  sent_at       timestamptz,
  used_at       timestamptz,
  revoked_at    timestamptz,
  expires_at    timestamptz not null default (now() + interval '60 days'),
  created_at    timestamptz not null default now()
);

create unique index if not exists review_invitations_token_key
  on public.review_invitations (token);
-- One outstanding invitation per person per subject: re-sending should reuse
-- the link rather than scatter several working tokens for one review.
create unique index if not exists review_invitations_subject_key
  on public.review_invitations (user_id, subject_type, subject_id)
  where revoked_at is null;

alter table public.review_invitations enable row level security;

drop policy if exists "review_invitations: own read" on public.review_invitations;
create policy "review_invitations: own read" on public.review_invitations for select
  using (user_id = (select auth.uid()) or public.is_admin());

-- Same alphabet as voucher redemption codes: no I, L, O, 0 or 1. A review link
-- gets forwarded, pasted, and occasionally read aloud.
create or replace function public.generate_review_token()
returns text
language plpgsql
volatile
as $fn$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_token text;
  v_exists boolean;
begin
  loop
    v_token := '';
    for _ in 1..16 loop
      v_token := v_token || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    select exists(select 1 from public.review_invitations where token = v_token) into v_exists;
    exit when not v_exists;
  end loop;
  return v_token;
end;
$fn$;

-- Admin-issued. Returns the existing live invitation when one is outstanding,
-- so re-sending an email does not invalidate the link already in an inbox.
create or replace function public.issue_review_invitation(
  p_user_id uuid,
  p_subject_type text,
  p_subject_id uuid
)
returns table (invitation_id uuid, token text, already_existed boolean)
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_src record;
  v_existing public.review_invitations%rowtype;
  v_id uuid;
  v_token text;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;

  select * into v_src from public.review_eligibility(p_subject_type, p_subject_id, p_user_id);
  if not found then
    raise exception 'not_eligible';
  end if;

  select * into v_existing
    from public.review_invitations
   where user_id = p_user_id and subject_type = p_subject_type and subject_id = p_subject_id
     and revoked_at is null
   limit 1;

  if found then
    invitation_id   := v_existing.id;
    token           := v_existing.token;
    already_existed := true;
    return next;
    return;
  end if;

  v_token := public.generate_review_token();
  insert into public.review_invitations
    (token, user_id, subject_type, subject_id, source_type, source_id, issued_by)
  values (v_token, p_user_id, p_subject_type, p_subject_id, v_src.source_type, v_src.source_id, auth.uid())
  returning id into v_id;

  invitation_id   := v_id;
  token           := v_token;
  already_existed := false;
  return next;
end;
$fn$;

-- What the review screen calls to turn a link into a form.
create or replace function public.resolve_review_invitation(p_token text)
returns table (
  subject_type text, subject_id uuid, subject_label text, already_reviewed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_inv public.review_invitations%rowtype;
  v_label text;
begin
  select * into v_inv from public.review_invitations
   where upper(trim(token)) = upper(trim(p_token));

  if not found then raise exception 'invitation_not_found'; end if;
  if v_inv.user_id <> auth.uid() then raise exception 'not_your_invitation'; end if;
  if v_inv.revoked_at is not null then raise exception 'invitation_revoked'; end if;
  if v_inv.expires_at < now() then raise exception 'invitation_expired'; end if;

  v_label := case v_inv.subject_type
    when 'coach'       then (select full_name from public.profiles where id = v_inv.subject_id)
    when 'coach_offer' then (select title from public.coach_offers where id = v_inv.subject_id)
    when 'facility'    then (select name from public.facilities where id = v_inv.subject_id)
    when 'tournament'  then (select name from public.tournaments where id = v_inv.subject_id)
  end;

  subject_type     := v_inv.subject_type;
  subject_id       := v_inv.subject_id;
  subject_label    := coalesce(v_label, 'your recent visit');
  already_reviewed := exists (
    select 1 from public.reviews r
     where r.author_id = v_inv.user_id
       and r.subject_type = v_inv.subject_type
       and r.subject_id = v_inv.subject_id
  );
  return next;
end;
$fn$;

-- The previous signature took a subject directly and would bypass the
-- invitation entirely, so it is dropped rather than left as an overload.
drop function if exists public.submit_review(text, uuid, smallint, text);

create or replace function public.submit_review(
  p_token text,
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
  v_inv   public.review_invitations%rowtype;
  v_id    uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'invalid_rating'; end if;

  select * into v_inv from public.review_invitations
   where upper(trim(token)) = upper(trim(p_token))
   for update;

  if not found then raise exception 'invitation_not_found'; end if;
  if v_inv.user_id <> v_actor then raise exception 'not_your_invitation'; end if;
  if v_inv.revoked_at is not null then raise exception 'invitation_revoked'; end if;
  if v_inv.expires_at < now() then raise exception 'invitation_expired'; end if;

  if not exists (select 1 from public.review_eligibility(v_inv.subject_type, v_inv.subject_id, v_actor)) then
    raise exception 'not_eligible';
  end if;

  insert into public.reviews (subject_type, subject_id, author_id, rating, body, source_type, source_id)
  values (v_inv.subject_type, v_inv.subject_id, v_actor, p_rating,
          nullif(trim(coalesce(p_body, '')), ''), v_inv.source_type, v_inv.source_id)
  on conflict (author_id, subject_type, subject_id) do update
    set rating = excluded.rating, body = excluded.body, updated_at = now()
  returning id into v_id;

  update public.review_invitations set used_at = coalesce(used_at, now()) where id = v_inv.id;
  return v_id;
end;
$fn$;

-- platform_settings is admin-editable and requires label/value_type.
insert into public.platform_settings (key, value, value_type, label, description, sort_order)
values
  ('reviews_display_enabled', 'false', 'boolean', 'Show review ratings',
   'When off, star ratings and review counts are hidden everywhere. Kept off until enough transactions exist for an average to mean anything.', 900),
  ('reviews_display_min_count', '3', 'number', 'Minimum reviews before showing a rating',
   'A subject with fewer reviews than this shows no rating even when display is on — one opinion is not an average.', 901)
on conflict (key) do nothing;

revoke all on function public.issue_review_invitation(uuid, text, uuid) from public;
revoke all on function public.submit_review(text, smallint, text) from public;
grant execute on function public.issue_review_invitation(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.resolve_review_invitation(text) to authenticated;
grant execute on function public.submit_review(text, smallint, text) to authenticated;

comment on table public.review_invitations is
  'Reviews are invitation-only: issuing the emailed link is the control over who may write. Eligibility (a real transaction) is a floor checked at both issue and submit.';

-- The email itself. variables is text[], not jsonb.
insert into public.email_templates (key, name, subject, preheader, html_body, variables, enabled, layout)
values (
  'review_invite',
  'Review invitation',
  'How was {{subject_label}}?',
  'Two taps to rate it.',
  '<p>Hi {{first_name}},</p>'
  '<p>Thanks for using Pickleball App. How was <strong>{{subject_label}}</strong>?</p>'
  '<p>It takes about ten seconds, and it helps the next player know what to expect.</p>'
  '<p><a href="{{review_url}}" class="btn">Leave a rating</a></p>'
  '<p style="font-size:13px;color:#6B7280">This link is just for you and expires in 60 days.</p>',
  array['first_name','subject_label','review_url'],
  true,
  (select layout from public.email_templates where layout is not null limit 1)
)
on conflict (key) do nothing;
