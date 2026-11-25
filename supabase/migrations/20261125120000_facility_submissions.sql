-- Facility submissions — Phase 2 of the public court directory (2026-11-25).
--
-- Signed-in players propose a NEW location or an EDIT to an existing one.
-- Nothing touches public.facilities until an admin approves; approval applies
-- the proposed fields through a column whitelist.
--
-- Why a table of its own rather than facility_manager_applications: that flow
-- is an OWNERSHIP claim (approval writes a facility_members owner row, sets
-- claim_status, auto-rejects competitors). A player saying "it has 8 courts,
-- not 6" claims nothing. Reused from it: facility_duplicate_candidates() for
-- the "is it one of these?" step, the notification shape (in-app + email), and
-- the pending/approved/rejected/withdrawn lifecycle.
--
-- Security design (rafter-secure-design walk, 2026-11-25):
--   * Writes only through SECURITY DEFINER functions with search_path = ''.
--     No INSERT/UPDATE/DELETE policy and no table write privileges for anon or
--     authenticated, so PostgREST cannot bypass the rules below.
--   * Every proposed key is on an allowlist with a type, a length/range and a
--     shape check (private.facility_submission_clean). An unknown key is an
--     error, not silently dropped — mass assignment cannot reach verified,
--     owner_user_id, claim_status, data_source, slug or anything else.
--   * Size limits: 8 KB payload, 1,000-char note, 10 pending per user, 20 per
--     24 hours, one pending edit per user per facility.
--   * Websites must be http(s); the web page also re-checks before rendering.
--     All text is rendered escaped (React; the email sender escapes variables).
--   * Submitter identity is visible to admins and to the submitter only.
--   * Approve/reject are admin-only (is_admin()) and lock the row, so a double
--     click cannot apply twice.

-- ─────────────────────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.facility_submissions (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('new', 'edit')),
  facility_id         uuid references public.facilities(id) on delete cascade,
  submitted_by        uuid not null references public.profiles(id) on delete cascade,
  proposed            jsonb not null default '{}'::jsonb,
  note                text check (note is null or char_length(note) <= 1000),
  status              text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by         uuid references public.profiles(id) on delete set null,
  reviewed_at         timestamptz,
  review_note         text check (review_note is null or char_length(review_note) <= 500),
  -- Which proposed keys the admin actually applied (an approval may be partial).
  applied_fields      text[],
  created_facility_id uuid references public.facilities(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint facility_submissions_target check ((kind = 'edit') = (facility_id is not null))
);

create unique index if not exists facility_submissions_one_pending_edit
  on public.facility_submissions (submitted_by, facility_id)
  where status = 'pending' and kind = 'edit';
create index if not exists facility_submissions_status_idx
  on public.facility_submissions (status, created_at desc);
create index if not exists facility_submissions_submitter_idx
  on public.facility_submissions (submitted_by, created_at desc);

alter table public.facility_submissions enable row level security;

drop policy if exists "facility submissions: own or admin read" on public.facility_submissions;
create policy "facility submissions: own or admin read"
  on public.facility_submissions for select to authenticated
  using (submitted_by = (select auth.uid()) or public.is_admin());

revoke all on public.facility_submissions from anon;
revoke insert, update, delete, truncate on public.facility_submissions from authenticated;
grant select on public.facility_submissions to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Validation: the allowlist
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function private.facility_submission_clean(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  k     text;
  v     jsonb;
  s     text;
  n     numeric;
  out   jsonb := '{}'::jsonb;
  text_max constant jsonb := '{"name":120,"address":200,"city":80,"description":1000,"hours_summary":300,"surface_type":40}';
  ints  constant text[] := array['court_count','indoor_courts','outdoor_courts'];
  bools constant text[] := array['lighting','restrooms','water','parking','public_access',
                                 'membership_required','reservation_required','open_play_available'];
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_payload';
  end if;
  if octet_length(p::text) > 8000 then
    raise exception 'payload_too_large';
  end if;

  for k, v in select * from jsonb_each(p) loop
    if jsonb_typeof(v) = 'null' then
      raise exception 'invalid_value:%', k;
    end if;

    if text_max ? k then
      if jsonb_typeof(v) <> 'string' then raise exception 'invalid_value:%', k; end if;
      s := btrim(v #>> '{}');
      if s ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'invalid_value:%', k; end if;
      if char_length(s) > (text_max ->> k)::int then raise exception 'too_long:%', k; end if;
      if k in ('name', 'city') and char_length(s) < 2 then raise exception 'too_short:%', k; end if;
      out := out || jsonb_build_object(k, s);

    elsif k = 'state' then
      s := upper(btrim(v #>> '{}'));
      if jsonb_typeof(v) <> 'string' or s !~ '^[A-Z]{2}$' then raise exception 'invalid_value:state'; end if;
      out := out || jsonb_build_object(k, s);

    elsif k = 'postal_code' then
      s := btrim(v #>> '{}');
      if jsonb_typeof(v) <> 'string' or s !~ '^[0-9]{5}(-[0-9]{4})?$' then raise exception 'invalid_value:postal_code'; end if;
      out := out || jsonb_build_object(k, s);

    elsif k = 'phone' then
      s := btrim(v #>> '{}');
      if jsonb_typeof(v) <> 'string' or char_length(s) > 30 or s !~ '^[0-9+() .\-x]{7,30}$' then
        raise exception 'invalid_value:phone';
      end if;
      out := out || jsonb_build_object(k, s);

    elsif k = 'website' then
      s := btrim(v #>> '{}');
      if jsonb_typeof(v) <> 'string' or char_length(s) > 300 or s !~* '^https?://[^\s<>"]+$' then
        raise exception 'invalid_value:website';
      end if;
      out := out || jsonb_build_object(k, s);

    elsif k in ('latitude', 'longitude') then
      if jsonb_typeof(v) <> 'number' then raise exception 'invalid_value:%', k; end if;
      n := (v #>> '{}')::numeric;
      if (k = 'latitude' and (n < -90 or n > 90)) or (k = 'longitude' and (n < -180 or n > 180)) then
        raise exception 'invalid_value:%', k;
      end if;
      out := out || jsonb_build_object(k, round(n, 7));

    elsif k = any (ints) then
      if jsonb_typeof(v) <> 'number' then raise exception 'invalid_value:%', k; end if;
      n := (v #>> '{}')::numeric;
      if n <> trunc(n) or n < 0 or n > 100 then raise exception 'invalid_value:%', k; end if;
      out := out || jsonb_build_object(k, n::int);

    elsif k = any (bools) then
      if jsonb_typeof(v) <> 'boolean' then raise exception 'invalid_value:%', k; end if;
      out := out || jsonb_build_object(k, v);

    else
      raise exception 'unknown_field:%', k;
    end if;
  end loop;

  if (out ? 'latitude') <> (out ? 'longitude') then
    raise exception 'invalid_value:coordinates';
  end if;
  return out;
end;
$fn$;

revoke all on function private.facility_submission_clean(jsonb) from public, anon, authenticated;

-- indoor + outdoor may not exceed the total (facilities.check_court_subtotals).
create or replace function private.facility_courts_consistent(p_total int, p_indoor int, p_outdoor int)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select coalesce(p_total, 0) = 0 or coalesce(p_indoor, 0) + coalesce(p_outdoor, 0) <= p_total;
$fn$;

revoke all on function private.facility_courts_consistent(int, int, int) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Submitting and withdrawing
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.submit_facility_submission(
  p_kind        text,
  p_facility_id uuid default null,
  p_proposed    jsonb default '{}'::jsonb,
  p_note        text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_clean jsonb;
  v_cur   jsonb;
  v_k     text;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_id    uuid;
begin
  if v_uid is null then raise exception 'sign_in_required'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and deleted_at is null) then
    raise exception 'sign_in_required';
  end if;
  if p_kind not in ('new', 'edit') then raise exception 'invalid_kind'; end if;
  if v_note is not null and char_length(v_note) > 1000 then raise exception 'too_long:note'; end if;

  if (select count(*) from public.facility_submissions
       where submitted_by = v_uid and status = 'pending') >= 10 then
    raise exception 'too_many_pending';
  end if;
  if (select count(*) from public.facility_submissions
       where submitted_by = v_uid and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'daily_limit';
  end if;

  v_clean := private.facility_submission_clean(coalesce(p_proposed, '{}'::jsonb));

  if p_kind = 'edit' then
    if p_facility_id is null then raise exception 'facility_required'; end if;
    select to_jsonb(f) into v_cur from public.facilities f where f.id = p_facility_id;
    if v_cur is null then raise exception 'facility_not_found'; end if;

    -- Keep only what actually changes, so the admin reviews a real diff.
    for v_k in select jsonb_object_keys(v_clean) loop
      if (v_cur -> v_k) = (v_clean -> v_k)
         or (jsonb_typeof(v_clean -> v_k) = 'number' and (v_cur ->> v_k)::numeric = (v_clean ->> v_k)::numeric) then
        v_clean := v_clean - v_k;
      end if;
    end loop;
    if v_clean = '{}'::jsonb and v_note is null then raise exception 'no_changes'; end if;

    if not private.facility_courts_consistent(
         coalesce((v_clean ->> 'court_count')::int, (v_cur ->> 'court_count')::int),
         coalesce((v_clean ->> 'indoor_courts')::int, (v_cur ->> 'indoor_courts')::int),
         coalesce((v_clean ->> 'outdoor_courts')::int, (v_cur ->> 'outdoor_courts')::int)) then
      raise exception 'invalid_value:court_count';
    end if;

    if exists (select 1 from public.facility_submissions
                where submitted_by = v_uid and facility_id = p_facility_id
                  and kind = 'edit' and status = 'pending') then
      raise exception 'already_pending';
    end if;
  else
    if p_facility_id is not null then raise exception 'invalid_kind'; end if;
    if not (v_clean ? 'name' and v_clean ? 'city' and v_clean ? 'state'
            and v_clean ? 'latitude' and v_clean ? 'longitude') then
      raise exception 'missing_required';
    end if;
    if not private.facility_courts_consistent(
         (v_clean ->> 'court_count')::int, (v_clean ->> 'indoor_courts')::int, (v_clean ->> 'outdoor_courts')::int) then
      raise exception 'invalid_value:court_count';
    end if;
  end if;

  insert into public.facility_submissions (kind, facility_id, submitted_by, proposed, note)
  values (p_kind, p_facility_id, v_uid, v_clean, v_note)
  returning id into v_id;
  return v_id;
end;
$fn$;

create or replace function public.withdraw_facility_submission(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
begin
  update public.facility_submissions
     set status = 'withdrawn', updated_at = now()
   where id = p_id and submitted_by = auth.uid() and status = 'pending';
  if not found then raise exception 'submission_not_found'; end if;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Admin queue
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.list_facility_submissions(p_status text default 'pending')
returns table (
  id uuid, kind text, status text, created_at timestamptz,
  facility_id uuid, facility_name text, facility_slug text, facility_city text, facility_state text,
  current_values jsonb, proposed jsonb, note text,
  submitter_id uuid, submitter_name text, submitter_email text, submitter_total integer,
  review_note text, reviewed_at timestamptz, created_facility_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query
  select s.id, s.kind, s.status, s.created_at,
         f.id, f.name, f.slug, f.city, f.state,
         -- Only the columns the submission touches, for a side-by-side diff.
         case when f.id is null then null
              else (select jsonb_object_agg(k, to_jsonb(f) -> k) from jsonb_object_keys(s.proposed) k) end,
         s.proposed, s.note,
         p.id, p.full_name, p.email,
         (select count(*)::int from public.facility_submissions s2 where s2.submitted_by = s.submitted_by),
         s.review_note, s.reviewed_at, s.created_facility_id
    from public.facility_submissions s
    join public.profiles p on p.id = s.submitted_by
    left join public.facilities f on f.id = s.facility_id
   where p_status is null or s.status = p_status
   order by s.created_at asc
   limit 200;
end;
$fn$;

create or replace function public.approve_facility_submission(
  p_id          uuid,
  p_fields      text[] default null,   -- subset of proposed keys to apply; null = all
  p_review_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_s    public.facility_submissions%rowtype;
  v_p    jsonb;
  v_keys text[];
  v_fid  uuid;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;

  select * into v_s from public.facility_submissions where id = p_id for update;
  if not found then raise exception 'submission_not_found'; end if;
  if v_s.status <> 'pending' then raise exception 'submission_not_pending'; end if;

  -- Re-validate: the stored payload was cleaned on the way in, but this is the
  -- write to the public directory, so it is checked again here.
  v_p := private.facility_submission_clean(v_s.proposed);
  if p_fields is not null then
    select coalesce(jsonb_object_agg(k, v_p -> k), '{}'::jsonb) into v_p
      from unnest(p_fields) k where v_p ? k;
  end if;
  select coalesce(array_agg(k order by k), '{}') into v_keys from jsonb_object_keys(v_p) k;

  if v_s.kind = 'new' then
    if not (v_p ? 'name' and v_p ? 'city' and v_p ? 'state' and v_p ? 'latitude' and v_p ? 'longitude') then
      raise exception 'missing_required';
    end if;
    insert into public.facilities (
      name, address, city, state, postal_code, country, latitude, longitude,
      phone, website, description, hours_summary, surface_type,
      court_count, indoor_courts, outdoor_courts,
      lighting, restrooms, water, parking, public_access,
      membership_required, reservation_required, open_play_available,
      data_source, created_by, verified, claim_status
    ) values (
      v_p ->> 'name', coalesce(v_p ->> 'address', ''), v_p ->> 'city', v_p ->> 'state',
      v_p ->> 'postal_code', 'US', (v_p ->> 'latitude')::numeric, (v_p ->> 'longitude')::numeric,
      v_p ->> 'phone', v_p ->> 'website', v_p ->> 'description', v_p ->> 'hours_summary', v_p ->> 'surface_type',
      coalesce((v_p ->> 'court_count')::int, 0), coalesce((v_p ->> 'indoor_courts')::int, 0),
      coalesce((v_p ->> 'outdoor_courts')::int, 0),
      coalesce((v_p ->> 'lighting')::boolean, false), coalesce((v_p ->> 'restrooms')::boolean, false),
      coalesce((v_p ->> 'water')::boolean, false), coalesce((v_p ->> 'parking')::boolean, false),
      coalesce((v_p ->> 'public_access')::boolean, true),
      coalesce((v_p ->> 'membership_required')::boolean, false),
      coalesce((v_p ->> 'reservation_required')::boolean, false),
      coalesce((v_p ->> 'open_play_available')::boolean, false),
      'user_submission', v_s.submitted_by, false, 'unclaimed'
    )
    returning id into v_fid;
  else
    v_fid := v_s.facility_id;
    -- Whitelist, spelled out: a key that is absent leaves the column alone.
    update public.facilities f set
      name                 = case when v_p ? 'name'                 then v_p ->> 'name'                           else f.name end,
      address              = case when v_p ? 'address'              then v_p ->> 'address'                        else f.address end,
      city                 = case when v_p ? 'city'                 then v_p ->> 'city'                           else f.city end,
      state                = case when v_p ? 'state'                then v_p ->> 'state'                          else f.state end,
      postal_code          = case when v_p ? 'postal_code'          then v_p ->> 'postal_code'                    else f.postal_code end,
      latitude             = case when v_p ? 'latitude'             then (v_p ->> 'latitude')::numeric            else f.latitude end,
      longitude            = case when v_p ? 'longitude'            then (v_p ->> 'longitude')::numeric           else f.longitude end,
      phone                = case when v_p ? 'phone'                then v_p ->> 'phone'                          else f.phone end,
      website              = case when v_p ? 'website'              then v_p ->> 'website'                        else f.website end,
      description          = case when v_p ? 'description'          then v_p ->> 'description'                    else f.description end,
      hours_summary        = case when v_p ? 'hours_summary'        then v_p ->> 'hours_summary'                  else f.hours_summary end,
      surface_type         = case when v_p ? 'surface_type'         then v_p ->> 'surface_type'                   else f.surface_type end,
      court_count          = case when v_p ? 'court_count'          then (v_p ->> 'court_count')::int             else f.court_count end,
      indoor_courts        = case when v_p ? 'indoor_courts'        then (v_p ->> 'indoor_courts')::int           else f.indoor_courts end,
      outdoor_courts       = case when v_p ? 'outdoor_courts'       then (v_p ->> 'outdoor_courts')::int          else f.outdoor_courts end,
      lighting             = case when v_p ? 'lighting'             then (v_p ->> 'lighting')::boolean            else f.lighting end,
      restrooms            = case when v_p ? 'restrooms'            then (v_p ->> 'restrooms')::boolean           else f.restrooms end,
      water                = case when v_p ? 'water'                then (v_p ->> 'water')::boolean               else f.water end,
      parking              = case when v_p ? 'parking'              then (v_p ->> 'parking')::boolean             else f.parking end,
      public_access        = case when v_p ? 'public_access'        then (v_p ->> 'public_access')::boolean       else f.public_access end,
      membership_required  = case when v_p ? 'membership_required'  then (v_p ->> 'membership_required')::boolean else f.membership_required end,
      reservation_required = case when v_p ? 'reservation_required' then (v_p ->> 'reservation_required')::boolean else f.reservation_required end,
      open_play_available  = case when v_p ? 'open_play_available'  then (v_p ->> 'open_play_available')::boolean else f.open_play_available end,
      updated_at           = now()
    where f.id = v_fid;
  end if;

  update public.facility_submissions
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = left(nullif(btrim(coalesce(p_review_note, '')), ''), 500),
         applied_fields = v_keys,
         created_facility_id = case when v_s.kind = 'new' then v_fid else null end,
         updated_at = now()
   where id = p_id;

  return v_fid;
end;
$fn$;

create or replace function public.reject_facility_submission(p_id uuid, p_review_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_note text := left(nullif(btrim(coalesce(p_review_note, '')), ''), 500);
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if v_note is null then raise exception 'reason_required'; end if;
  update public.facility_submissions
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = v_note, updated_at = now()
   where id = p_id and status = 'pending';
  if not found then raise exception 'submission_not_pending'; end if;
end;
$fn$;

revoke all on function public.submit_facility_submission(text, uuid, jsonb, text) from public, anon;
revoke all on function public.withdraw_facility_submission(uuid) from public, anon;
revoke all on function public.list_facility_submissions(text) from public, anon;
revoke all on function public.approve_facility_submission(uuid, text[], text) from public, anon;
revoke all on function public.reject_facility_submission(uuid, text) from public, anon;
grant execute on function public.submit_facility_submission(text, uuid, jsonb, text) to authenticated;
grant execute on function public.withdraw_facility_submission(uuid) to authenticated;
grant execute on function public.list_facility_submissions(text) to authenticated;
grant execute on function public.approve_facility_submission(uuid, text[], text) to authenticated;
grant execute on function public.reject_facility_submission(uuid, text) to authenticated;

-- The "is it one of these?" step on the new-location form. Same function the
-- facility-manager flow uses; already granted to authenticated.

-- ─────────────────────────────────────────────────────────────────────────────
-- Telling the submitter
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.email_templates (key, name, subject, preheader, html_body, variables, layout)
values
  ('facility_submission_approved', 'Court submission approved',
   'Thanks! Your update to {{facility_name}} is live',
   'Your court submission was approved.',
   '<p>Hi {{first_name}},</p><p>Thanks for helping other players. Your submission for <strong>{{facility_name}}</strong> was approved and is now in the court directory.</p>',
   array['first_name', 'facility_name'], 'transactional'),
  ('facility_submission_rejected', 'Court submission not approved',
   'About your submission for {{facility_name}}',
   'We could not approve this submission.',
   '<p>Hi {{first_name}},</p><p>Thanks for your submission for <strong>{{facility_name}}</strong>. We could not approve it this time.</p><p>{{reason}}</p><p>If you think we got it wrong, reply to this email and we will take another look.</p>',
   array['first_name', 'facility_name', 'reason'], 'transactional')
on conflict (key) do nothing;

create or replace function public.fn_notify_facility_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_email text;
  v_first text;
  v_label text;
  v_fid   uuid := coalesce(new.created_facility_id, new.facility_id);
begin
  if new.status is not distinct from old.status or new.status not in ('approved', 'rejected') then
    return new;
  end if;

  select p.email, coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), 'there')
    into v_email, v_first
    from public.profiles p where p.id = new.submitted_by;

  v_label := coalesce(
    (select f.name from public.facilities f where f.id = v_fid),
    nullif(btrim(coalesce(new.proposed ->> 'name', '')), ''),
    'a court');

  if new.status = 'approved' then
    insert into public.notifications (user_id, type, title, body, link, idempotency_key)
    values (new.submitted_by, 'facility_submission_approved',
            'Your court submission is live',
            'Thanks! Your update to ' || v_label || ' was approved.',
            case when v_fid is not null then '/facility/' || v_fid::text end,
            'facility-submission-approved/' || new.id::text);
    if v_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_email,
        'templateKey', 'facility_submission_approved',
        'variables', jsonb_build_object('first_name', v_first, 'facility_name', v_label),
        'idempotencyKey', 'facility-submission-approved/' || new.id::text));
    end if;
  else
    insert into public.notifications (user_id, type, title, body, link, idempotency_key)
    values (new.submitted_by, 'facility_submission_rejected',
            'About your court submission',
            coalesce(new.review_note, 'We could not approve your submission for ' || v_label || '.'),
            case when v_fid is not null then '/facility/' || v_fid::text end,
            'facility-submission-rejected/' || new.id::text);
    if v_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_email,
        'templateKey', 'facility_submission_rejected',
        'variables', jsonb_build_object(
          'first_name', v_first,
          'facility_name', v_label,
          -- Never blank: an unresolved template variable is a 422, not an email.
          'reason', coalesce(new.review_note, 'We could not confirm these details.')),
        'idempotencyKey', 'facility-submission-rejected/' || new.id::text));
    end if;
  end if;
  return new;
end;
$fn$;

revoke all on function public.fn_notify_facility_submission() from public, anon, authenticated;

drop trigger if exists trg_notify_facility_submission on public.facility_submissions;
create trigger trg_notify_facility_submission
  after update of status on public.facility_submissions
  for each row execute function public.fn_notify_facility_submission();

comment on table public.facility_submissions is
  'Player-proposed new courts and edits to existing ones (web /courts, 2026-11-25). Nothing reaches facilities until an admin approves through approve_facility_submission(), which applies a column whitelist.';
