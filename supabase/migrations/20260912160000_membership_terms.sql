-- Membership terms: a renewal earns a second PGD voucher.
--
-- Section 2 of MEMBERSHIP_PHASE5_STOREKIT.md, and the only part of Phase 5 that
-- touches existing schema. Deliberately shipped AHEAD of the StoreKit work: it
-- is pure SQL, it depends on nothing RevenueCat does, and it carries a backfill
-- that must land before any renewal can occur.
--
-- Decision (2026-09-12): a renewal earns another $25 voucher. Until now
-- issue_membership_voucher() keyed source_id to the membership ROW, so the
-- idempotency index refused a second issue forever.
--
-- Two ways this costs real money, both guarded below:
--
--   1. Changing the source_id format without backfilling. The new key would
--      match nothing, and every existing member would be issued a second $25.
--      The backfill is in this migration, before the function changes.
--   2. Treating any expiry change as a renewal. An admin correcting a typo
--      would mint $25. So extending and renewing are different verbs:
--      admin_grant_membership still does NOT increment the term, and only an
--      explicit renewal does.

-- ── The term columns ─────────────────────────────────────────────────────────

alter table public.memberships
  add column if not exists term_seq integer not null default 1,
  add column if not exists current_term_started_at timestamptz not null default now();

comment on column public.memberships.term_seq is
  'Which paid term this is. 1 on first purchase, +1 per renewal. Part of the wallet voucher source_id, so it is what makes a renewal earn a new voucher.';

comment on column public.memberships.current_term_started_at is
  'Start of the CURRENT term, unlike started_at which is the start of the membership.';

-- ── Backfill, before anything can issue against the new key ─────────────────
-- Existing vouchers carry source_id = <membership_id>. Without this they would
-- not match <membership_id>:<term_seq> and every current member would be handed
-- a second voucher the next time issuance ran.

update public.wallet_items
   set source_id = source_id || ':1'
 where source_type = 'membership_benefit'
   and source_id is not null
   and source_id not like '%:%';

-- ── Issuance keys on the term ───────────────────────────────────────────────
-- Verbatim re-issue of 20260912120000's function with one change: v_source_id.

create or replace function public.issue_membership_voucher(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_membership public.memberships;
  v_partner    public.wallet_partners;
  v_template   text;
  v_code       public.wallet_promo_codes;
  v_item       public.wallet_items;
  v_source_id  text;
begin
  select * into v_membership
    from public.memberships
   where user_id = p_user_id and status = 'active';

  if not found then
    return jsonb_build_object('issued', false, 'reason', 'no_active_membership');
  end if;

  -- One voucher per TERM. Extending a term reuses the same key and issues
  -- nothing; starting a new term (start_membership_term) issues one more.
  v_source_id := v_membership.id::text || ':' || v_membership.term_seq::text;

  select * into v_item
    from public.wallet_items
   where user_id = p_user_id
     and source_type = 'membership_benefit'
     and source_id = v_source_id
     and type = 'offer';

  if found then
    return jsonb_build_object('issued', false, 'reason', 'already_issued', 'item_id', v_item.id);
  end if;

  select * into v_partner from public.wallet_partners where slug = 'pickleball-grip-doctor';
  if not found or not v_partner.is_active then
    return jsonb_build_object('issued', false, 'reason', 'partner_unavailable');
  end if;

  v_template := v_partner.metadata->>'discount_url_template';
  if v_template is null or v_template !~* '^https://' or position('{CODE}' in v_template) = 0 then
    return jsonb_build_object('issued', false, 'reason', 'url_template_not_configured');
  end if;

  update public.wallet_promo_codes
     set assigned_to = p_user_id,
         assigned_at = now()
   where id = (
     select c.id
       from public.wallet_promo_codes c
      where c.partner_id = v_partner.id
        and c.assigned_to is null
        and c.voided_at is null
      order by c.created_at
      limit 1
      for update skip locked
   )
   returning * into v_code;

  if not found then
    return jsonb_build_object('issued', false, 'reason', 'no_codes_available');
  end if;

  insert into public.wallet_items (
    user_id, partner_id, type, status,
    title, subtitle, description, value_label,
    action_type, action_label, action_url,
    external_system, external_reference_id,
    expires_at,
    source_type, source_id
  ) values (
    p_user_id, v_partner.id, 'offer', 'available',
    '$25 Pickleball Grip Doctor Voucher',
    'Member benefit',
    'One-time use. $25 toward products; does not apply to shipping, and any '
      || 'unused balance does not carry forward.',
    '$25',
    'external_url', 'Shop now',
    replace(v_template, '{CODE}', v_code.code),
    'shopify', v_code.code,
    v_membership.expires_at,
    'membership_benefit', v_source_id
  )
  returning * into v_item;

  update public.wallet_promo_codes set wallet_item_id = v_item.id where id = v_code.id;

  insert into public.wallet_activity (wallet_item_id, user_id, event_type, title, description)
  values (v_item.id, p_user_id, 'granted', v_item.title,
          'Issued with membership term ' || v_membership.term_seq::text);

  return jsonb_build_object('issued', true, 'reason', 'issued', 'item_id', v_item.id);
end;
$function$;

revoke execute on function public.issue_membership_voucher(uuid) from public, anon;
grant  execute on function public.issue_membership_voucher(uuid) to authenticated, service_role;

-- ── Starting a new term ─────────────────────────────────────────────────────
-- The shared core. Phase 5's RevenueCat webhook calls this on a RENEWAL event;
-- the admin wrapper below calls it for comps. One implementation, so the two
-- paths cannot drift on what a renewal means.

create or replace function public.start_membership_term(
  p_user_id      uuid,
  p_expires_at   timestamptz,
  p_external_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.memberships;
begin
  select * into v_row
    from public.memberships
   where user_id = p_user_id and status = 'active'
   for update;

  if not found then
    raise exception 'no_active_membership' using errcode = 'P0001';
  end if;

  -- A perpetual comp has no term to renew. Silently minting a voucher for one
  -- would be the surprise this whole migration exists to prevent.
  if v_row.expires_at is null then
    raise exception 'membership_has_no_term' using errcode = 'P0001',
      hint = 'This membership never expires, so there is no term to renew.';
  end if;

  -- The double-click guard, and it is load-bearing: each call mints $25. A
  -- renewal must move the expiry FORWARD, so pressing the button twice with the
  -- same date fails the second time instead of issuing a second voucher.
  if p_expires_at is null or p_expires_at <= v_row.expires_at then
    raise exception 'renewal_must_extend' using errcode = 'P0001',
      hint = 'A new term must end later than the current one.';
  end if;

  update public.memberships
     set term_seq                = term_seq + 1,
         current_term_started_at = now(),
         expires_at              = p_expires_at,
         external_reference_id   = coalesce(p_external_ref, external_reference_id),
         updated_at              = now()
   where id = v_row.id
   returning * into v_row;

  -- The point of the whole exercise: a new term earns a new voucher. Still
  -- non-fatal if the pool is dry -- a renewal must not fail because a promo ran
  -- out, exactly as a first grant must not.
  return jsonb_build_object(
    'term_seq', v_row.term_seq,
    'expires_at', v_row.expires_at,
    'voucher', public.issue_membership_voucher(p_user_id)
  );
end;
$function$;

revoke execute on function public.start_membership_term(uuid, timestamptz, text) from public, anon, authenticated;
grant  execute on function public.start_membership_term(uuid, timestamptz, text) to service_role;

comment on function public.start_membership_term(uuid, timestamptz, text) is
  'Begins a new paid term: increments term_seq and issues that term''s voucher. service_role only -- the caller is a store webhook with no user session. Admins go through admin_renew_membership().';

-- ── Admin wrapper ───────────────────────────────────────────────────────────

create or replace function public.admin_renew_membership(
  p_user_id    uuid,
  p_expires_at timestamptz,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = 'P0001';
  end if;

  if p_expires_at <= now() then
    raise exception 'expires_at_in_past' using errcode = 'P0001';
  end if;

  v_result := public.start_membership_term(p_user_id, p_expires_at, null);

  if p_note is not null and btrim(p_note) <> '' then
    update public.memberships
       set granted_note = p_note, granted_by = auth.uid()
     where user_id = p_user_id and status = 'active';
  end if;

  return v_result;
end;
$function$;

revoke execute on function public.admin_renew_membership(uuid, timestamptz, text) from public, anon;
grant  execute on function public.admin_renew_membership(uuid, timestamptz, text) to authenticated;

comment on function public.admin_renew_membership(uuid, timestamptz, text) is
  'Starts a NEW term for a comped membership, issuing another voucher. Distinct from admin_grant_membership, which extends the CURRENT term and issues nothing.';

-- ── Extending a term carries its voucher's expiry with it ───────────────────
-- Found while testing: the voucher's expires_at is copied from the term at
-- ISSUANCE, so extending a term left the voucher expiring earlier than the
-- membership that earned it. A member could lose the benefit while still paid
-- up. Extending must not issue a voucher, but it must move the one that exists.
--
-- Only the CURRENT term's item, and only while it is still 'available' -- a
-- redeemed, expired or revoked voucher is history and is not re-opened.

create or replace function public.admin_grant_membership(
  p_user_id    uuid,
  p_expires_at timestamptz default null,
  p_note       text        default null
)
returns public.memberships
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.memberships;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = 'P0001';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'expires_at_in_past' using errcode = 'P0001';
  end if;

  update public.memberships
     set expires_at   = p_expires_at,
         granted_by   = auth.uid(),
         granted_note = coalesce(p_note, granted_note),
         updated_at   = now()
   where user_id = p_user_id and status = 'active'
   returning * into v_row;

  if found then
    -- Still no term increment and no new voucher: extending is not renewing.
    update public.wallet_items
       set expires_at = v_row.expires_at
     where user_id = p_user_id
       and source_type = 'membership_benefit'
       and source_id = v_row.id::text || ':' || v_row.term_seq::text
       and status = 'available';

    perform public.issue_membership_voucher(p_user_id);
    return v_row;
  end if;

  insert into public.memberships (user_id, source, expires_at, granted_by, granted_note)
  values (p_user_id, 'admin_grant', p_expires_at, auth.uid(), p_note)
  returning * into v_row;

  perform public.issue_membership_voucher(p_user_id);

  return v_row;
end;
$function$;

revoke execute on function public.admin_grant_membership(uuid, timestamptz, text) from public, anon;
grant  execute on function public.admin_grant_membership(uuid, timestamptz, text) to authenticated;

-- ── What deliberately did not change ────────────────────────────────────────
--
-- `admin_grant_membership` still does not touch term_seq. Extending, correcting
-- a date, or fixing a typo issues nothing. That is the safe default, and making
-- a renewal a separate function is what keeps minting money an explicit act
-- rather than a side effect of editing a date field.
