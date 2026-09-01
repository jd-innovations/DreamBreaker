-- Facility Marketplace Phase 1 — "Become a Facility Manager".
--
-- Modelled on the shipped director flow (apply_to_be_director -> admin
-- approves -> fn_notify_director_status) rather than a new mechanism, with one
-- dimension director does not have: director_status is a property of the
-- PERSON, but a facility manager must be bound to one of 194 specific venues.
-- A global flag would grant authority over every one of them.
--
-- So the application names a facility, and approval writes a facility_members
-- row with role 'owner'. The applicant then adds their own staff without
-- coming back to an admin: an admin vets the FIRST relationship per venue, not
-- every employee.
--
-- Deliberately NO new profiles column. "Is a facility manager" is derivable
-- from facility_members, and profiles already carries director_status and
-- coach_status — a third parallel status column is the point where three
-- near-identical flows should become one shared mechanism instead.
--
-- ── The application is a form, and the edits are the evidence ────────────────
--
-- The applicant searches the existing facilities, corrects the listing, and
-- submits — or proposes a new facility if theirs is genuinely absent. Someone
-- who runs the venue knows its court count, hours and phone; someone who does
-- not cannot fake that convincingly. That is better evidence than a
-- domain-matched email, which any employee has.
--
-- Nothing writes to `facilities` before approval. Proposed data sits in the
-- application as jsonb, so a rejected application leaves the directory
-- untouched, and an admin reviews the ownership claim and the data edits
-- together as one decision.

create table if not exists public.facility_manager_applications (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid not null references public.profiles(id) on delete cascade,

  -- null when proposing a facility that does not exist yet. Exactly one of
  -- (facility_id, a name inside proposed) must be present — see the check.
  facility_id   uuid references public.facilities(id) on delete cascade,

  -- Corrections to an existing listing, or the fields of a new one. Applied to
  -- `facilities` only on approval, and only through a column whitelist.
  proposed      jsonb not null default '{}'::jsonb,
  applicant_note text,

  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,

  -- Set on approval when the application created a new facility, so the row
  -- records what it produced.
  created_facility_id uuid references public.facilities(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint facility_manager_applications_target_present check (
    facility_id is not null or nullif(trim(coalesce(proposed->>'name', '')), '') is not null
  )
);

-- One live application per person per venue. Re-applying should not scatter
-- several pending requests an admin has to reconcile.
create unique index if not exists facility_manager_applications_live_key
  on public.facility_manager_applications (applicant_id, facility_id)
  where status = 'pending' and facility_id is not null;

create index if not exists facility_manager_applications_status_idx
  on public.facility_manager_applications (status, created_at desc);

alter table public.facility_manager_applications enable row level security;

drop policy if exists "facility applications: own read" on public.facility_manager_applications;
create policy "facility applications: own read"
  on public.facility_manager_applications for select
  using (applicant_id = (select auth.uid()) or public.is_admin());

-- No INSERT or UPDATE policy: writes go through the functions below, which is
-- where the rules live. A direct insert would be an application that skipped
-- the "is this venue already owned?" check.

-- ─────────────────────────────────────────────────────────────────────────────
-- Duplicate detection
-- ─────────────────────────────────────────────────────────────────────────────
-- 178 of 194 facilities came from Google Places. Two rows for one venue
-- eventually means two owners and two payout destinations, so the "not listed"
-- path has to work hard to avoid creating one. Name similarity alone is weak
-- ("Lakewood Ranch Athletic Club" vs "Lakewood Ranch AC"), so proximity does
-- most of the work.
create or replace function public.facility_duplicate_candidates(
  p_name text,
  p_latitude numeric,
  p_longitude numeric,
  p_radius_meters integer default 2000
)
returns table (id uuid, name text, address text, city text, distance_meters double precision)
language sql
stable
security definer
set search_path = public
as $fn$
  select f.id, f.name, f.address, f.city,
         st_distance(
           f.coords::geography,
           st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography
         ) as distance_meters
    from public.facilities f
   where f.coords is not null
     and st_dwithin(
           f.coords::geography,
           st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::geography,
           greatest(100, least(coalesce(p_radius_meters, 2000), 20000))
         )
   order by
     -- An obvious name match floats to the top regardless of distance.
     case when lower(f.name) like '%' || lower(coalesce(p_name,'')) || '%'
            or lower(coalesce(p_name,'')) like '%' || lower(f.name) || '%'
          then 0 else 1 end,
     distance_meters
   limit 10;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Applying
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.apply_to_manage_facility(
  p_facility_id uuid,
  p_proposed jsonb default '{}'::jsonb,
  p_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  if p_facility_id is null
     and nullif(trim(coalesce(p_proposed->>'name', '')), '') is null then
    raise exception 'facility_or_name_required';
  end if;

  if p_facility_id is not null then
    if not exists (select 1 from public.facilities where id = p_facility_id) then
      raise exception 'facility_not_found';
    end if;

    -- Already owned. A second owner is a support conversation, not a form.
    if exists (
      select 1 from public.facility_members
       where facility_id = p_facility_id and role = 'owner'
    ) then
      raise exception 'facility_already_managed';
    end if;

    if exists (
      select 1 from public.facility_manager_applications
       where applicant_id = v_actor and facility_id = p_facility_id and status = 'pending'
    ) then
      raise exception 'application_already_pending';
    end if;
  end if;

  insert into public.facility_manager_applications
    (applicant_id, facility_id, proposed, applicant_note)
  values (v_actor, p_facility_id, coalesce(p_proposed, '{}'::jsonb), nullif(trim(coalesce(p_note,'')), ''))
  returning id into v_id;

  -- Visible in the directory as spoken for, using the transition the guard
  -- trigger permits. Only for an existing facility; a proposed one has no row
  -- yet, by design.
  if p_facility_id is not null then
    update public.facilities
       set claim_status = 'pending'
     where id = p_facility_id and claim_status = 'unclaimed';
  end if;

  return v_id;
end;
$fn$;

create or replace function public.withdraw_facility_manager_application(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_app public.facility_manager_applications%rowtype;
begin
  select * into v_app from public.facility_manager_applications where id = p_id;
  if not found then raise exception 'application_not_found'; end if;
  if v_app.applicant_id <> auth.uid() then raise exception 'not_your_application'; end if;
  if v_app.status <> 'pending' then raise exception 'application_not_pending'; end if;

  update public.facility_manager_applications
     set status = 'withdrawn', updated_at = now()
   where id = p_id;

  -- Release the listing only if nobody else is still waiting on it.
  if v_app.facility_id is not null and not exists (
    select 1 from public.facility_manager_applications
     where facility_id = v_app.facility_id and status = 'pending' and id <> p_id
  ) then
    update public.facilities set claim_status = 'unclaimed'
     where id = v_app.facility_id and claim_status = 'pending';
  end if;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Reviewing
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.list_facility_manager_applications(
  p_status text default 'pending'
)
returns table (
  id uuid, applicant_id uuid, applicant_name text, applicant_email text,
  facility_id uuid, facility_name text, is_new_facility boolean,
  proposed jsonb, applicant_note text, status text,
  competing_applications integer, created_at timestamptz
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
  select a.id, a.applicant_id, p.full_name, p.email,
         a.facility_id, f.name, (a.facility_id is null),
         a.proposed, a.applicant_note, a.status,
         -- Two people claiming one venue is the case an admin most needs to
         -- see before approving either.
         (select count(*)::integer from public.facility_manager_applications o
           where o.facility_id = a.facility_id and o.status = 'pending'
             and o.id <> a.id and a.facility_id is not null),
         a.created_at
    from public.facility_manager_applications a
    join public.profiles p on p.id = a.applicant_id
    left join public.facilities f on f.id = a.facility_id
   where (p_status is null or a.status = p_status)
   order by a.created_at asc;
end;
$fn$;

create or replace function public.approve_facility_manager_application(
  p_id uuid,
  p_review_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_app public.facility_manager_applications%rowtype;
  v_fid uuid;
  v_p   jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;

  select * into v_app from public.facility_manager_applications where id = p_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if v_app.status <> 'pending' then raise exception 'application_not_pending'; end if;

  v_p := coalesce(v_app.proposed, '{}'::jsonb);

  if v_app.facility_id is null then
    -- A new venue. verified stays false: approving an operator is not the same
    -- as vouching for the listing.
    insert into public.facilities (
      name, address, address_line_2, city, state, postal_code, country,
      latitude, longitude, phone, website, description,
      court_count, indoor_courts, outdoor_courts, surface_type,
      lighting, restrooms, water, parking,
      public_access, membership_required, bookable_by_public,
      hours_summary, amenities,
      data_source, created_by, verified, claim_status, owner_user_id
    ) values (
      v_p->>'name',
      coalesce(v_p->>'address', ''),
      v_p->>'address_line_2',
      coalesce(v_p->>'city', ''),
      coalesce(v_p->>'state', ''),
      v_p->>'postal_code',
      coalesce(v_p->>'country', 'US'),
      (v_p->>'latitude')::numeric,
      (v_p->>'longitude')::numeric,
      v_p->>'phone',
      v_p->>'website',
      v_p->>'description',
      coalesce((v_p->>'court_count')::integer, 0),
      coalesce((v_p->>'indoor_courts')::integer, 0),
      coalesce((v_p->>'outdoor_courts')::integer, 0),
      v_p->>'surface_type',
      coalesce((v_p->>'lighting')::boolean, false),
      coalesce((v_p->>'restrooms')::boolean, false),
      coalesce((v_p->>'water')::boolean, false),
      coalesce((v_p->>'parking')::boolean, false),
      coalesce((v_p->>'public_access')::boolean, true),
      coalesce((v_p->>'membership_required')::boolean, false),
      coalesce((v_p->>'bookable_by_public')::boolean, false),
      v_p->>'hours_summary',
      case when jsonb_typeof(v_p->'amenities') = 'array'
           then array(select jsonb_array_elements_text(v_p->'amenities'))
           else '{}'::text[] end,
      'facility_manager_application',
      v_app.applicant_id,
      false,
      'claimed',
      v_app.applicant_id
    )
    returning id into v_fid;
  else
    v_fid := v_app.facility_id;

    -- Column whitelist, spelled out. The proposed jsonb is applicant-supplied,
    -- so anything not named here (verified, claim_status, id, data_source...)
    -- cannot be written no matter what the payload contains.
    update public.facilities f set
      name                = coalesce(nullif(trim(coalesce(v_p->>'name','')),''), f.name),
      address             = coalesce(nullif(trim(coalesce(v_p->>'address','')),''), f.address),
      address_line_2      = coalesce(v_p->>'address_line_2', f.address_line_2),
      city                = coalesce(nullif(trim(coalesce(v_p->>'city','')),''), f.city),
      state               = coalesce(nullif(trim(coalesce(v_p->>'state','')),''), f.state),
      postal_code         = coalesce(v_p->>'postal_code', f.postal_code),
      latitude            = coalesce((v_p->>'latitude')::numeric, f.latitude),
      longitude           = coalesce((v_p->>'longitude')::numeric, f.longitude),
      phone               = coalesce(v_p->>'phone', f.phone),
      website             = coalesce(v_p->>'website', f.website),
      description         = coalesce(v_p->>'description', f.description),
      court_count         = coalesce((v_p->>'court_count')::integer, f.court_count),
      indoor_courts       = coalesce((v_p->>'indoor_courts')::integer, f.indoor_courts),
      outdoor_courts      = coalesce((v_p->>'outdoor_courts')::integer, f.outdoor_courts),
      surface_type        = coalesce(v_p->>'surface_type', f.surface_type),
      lighting            = coalesce((v_p->>'lighting')::boolean, f.lighting),
      restrooms           = coalesce((v_p->>'restrooms')::boolean, f.restrooms),
      water               = coalesce((v_p->>'water')::boolean, f.water),
      parking             = coalesce((v_p->>'parking')::boolean, f.parking),
      public_access       = coalesce((v_p->>'public_access')::boolean, f.public_access),
      membership_required = coalesce((v_p->>'membership_required')::boolean, f.membership_required),
      bookable_by_public  = coalesce((v_p->>'bookable_by_public')::boolean, f.bookable_by_public),
      hours_summary       = coalesce(v_p->>'hours_summary', f.hours_summary),
      amenities           = case when jsonb_typeof(v_p->'amenities') = 'array'
                                 then array(select jsonb_array_elements_text(v_p->'amenities'))
                                 else f.amenities end,
      claim_status        = 'claimed',
      owner_user_id       = v_app.applicant_id,
      updated_at          = now()
    where f.id = v_fid;
  end if;

  -- The authority itself. Everything downstream (courts, deals, payouts) reads
  -- this, not owner_user_id.
  insert into public.facility_members (facility_id, user_id, role, created_by)
  values (v_fid, v_app.applicant_id, 'owner', auth.uid())
  on conflict do nothing;

  update public.facility_manager_applications
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(trim(coalesce(p_review_note,'')),''),
         created_facility_id = case when v_app.facility_id is null then v_fid else null end,
         updated_at = now()
   where id = p_id;

  -- Competing claims on the same venue lose automatically; leaving them
  -- pending would show an admin a queue of decisions already made.
  if v_app.facility_id is not null then
    update public.facility_manager_applications
       set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
           review_note = 'Another application for this facility was approved.',
           updated_at = now()
     where facility_id = v_app.facility_id and status = 'pending' and id <> p_id;
  end if;

  return v_fid;
end;
$fn$;

create or replace function public.reject_facility_manager_application(
  p_id uuid,
  p_review_note text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_app public.facility_manager_applications%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;

  select * into v_app from public.facility_manager_applications where id = p_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if v_app.status <> 'pending' then raise exception 'application_not_pending'; end if;

  update public.facility_manager_applications
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(trim(coalesce(p_review_note,'')),''), updated_at = now()
   where id = p_id;

  -- Release the listing unless someone else is still in the queue for it.
  if v_app.facility_id is not null and not exists (
    select 1 from public.facility_manager_applications
     where facility_id = v_app.facility_id and status = 'pending' and id <> p_id
  ) then
    update public.facilities set claim_status = 'unclaimed'
     where id = v_app.facility_id and claim_status = 'pending';
  end if;
end;
$fn$;

revoke all on function public.apply_to_manage_facility(uuid, jsonb, text) from public;
revoke all on function public.withdraw_facility_manager_application(uuid) from public;
revoke all on function public.list_facility_manager_applications(text) from public;
revoke all on function public.approve_facility_manager_application(uuid, text) from public;
revoke all on function public.reject_facility_manager_application(uuid, text) from public;
revoke all on function public.facility_duplicate_candidates(text, numeric, numeric, integer) from public;

grant execute on function public.apply_to_manage_facility(uuid, jsonb, text) to authenticated;
grant execute on function public.withdraw_facility_manager_application(uuid) to authenticated;
grant execute on function public.facility_duplicate_candidates(text, numeric, numeric, integer) to authenticated;
grant execute on function public.list_facility_manager_applications(text) to authenticated, service_role;
grant execute on function public.approve_facility_manager_application(uuid, text) to authenticated, service_role;
grant execute on function public.reject_facility_manager_application(uuid, text) to authenticated, service_role;

comment on table public.facility_manager_applications is
  'Phase 1 of the facility marketplace. The application names a venue and carries proposed edits as evidence; approval writes a facility_members owner row. Nothing touches facilities until an admin approves.';
