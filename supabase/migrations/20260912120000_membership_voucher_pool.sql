-- Phase 4 — the PGD voucher, issued from a pre-cut code pool.
--
-- Decision 0.4 (2026-09-12): a CSV pool, not the Shopify Admin API. No
-- credentials in our stack, no mid-grant HTTP call, and it works today. The
-- costs are known and written down at the bottom of this file rather than
-- discovered later.
--
-- Decision 0.1 (2026-09-12): PGD funds the voucher, as $25 against product with
-- shipping excluded and no carry-forward. Store-side that is a fixed-amount
-- DISCOUNT CODE and explicitly not a gift card -- gift cards carry a balance
-- forward, which is the one behaviour ruled out. Nothing in this migration can
-- enforce that; it is a property of how the codes are cut in Shopify.

-- ── The pool ─────────────────────────────────────────────────────────────────

create table if not exists public.wallet_promo_codes (
  id             uuid        primary key default gen_random_uuid(),
  partner_id     uuid        not null references public.wallet_partners(id),

  -- Stored as uploaded. Shopify discount codes are matched case-insensitively
  -- at checkout, but the code that goes in the link should be the code that
  -- was cut, so the normalisation on upload is trim-only.
  code           text        not null,
  batch_label    text,

  assigned_to    uuid        references public.profiles(id),
  assigned_at    timestamptz,
  wallet_item_id uuid        references public.wallet_items(id),

  -- A batch cut wrong, or a partner withdrawing an offer. Voided codes stay in
  -- the table: "why did this person never get a voucher" is answerable only if
  -- the row survives.
  voided_at      timestamptz,
  voided_reason  text,

  created_by     uuid        references public.profiles(id),
  created_at     timestamptz not null default now(),

  constraint wallet_promo_codes_unique unique (partner_id, code)
);

comment on table public.wallet_promo_codes is
  'Pre-generated partner discount codes awaiting assignment. A code is a bearer instrument: never exposed to the client, only counted.';

-- Supports the claim in issue_membership_voucher(): the first unassigned,
-- unvoided code for a partner.
create index if not exists idx_wallet_promo_codes_available
  on public.wallet_promo_codes (partner_id, created_at)
  where assigned_to is null and voided_at is null;

create index if not exists idx_wallet_promo_codes_assigned_to
  on public.wallet_promo_codes (assigned_to)
  where assigned_to is not null;

-- RLS on, and deliberately NO policies at all -- not even for admins.
--
-- Every other admin surface this week got a `for select` policy so the browser
-- could read the table directly. Not here. A code is worth $25 to whoever holds
-- it, and a readable table is one misconfigured policy away from a bulk dump of
-- unissued codes. Admins get counts through admin_promo_code_stock() and
-- nothing else; the only thing that ever reads a code is the SECURITY DEFINER
-- function that assigns it.
alter table public.wallet_promo_codes enable row level security;

-- ── Where the redemption link comes from ─────────────────────────────────────
-- On the partner rather than in this function, so pointing at a different store
-- or a different URL shape is a data change. {CODE} is the placeholder.

update public.wallet_partners
   set metadata = metadata || jsonb_build_object(
         'discount_url_template', 'https://pickleballgripdoctor.com/discount/{CODE}'
       )
 where slug = 'pickleball-grip-doctor'
   and metadata->>'discount_url_template' is null;

-- ── Upload ───────────────────────────────────────────────────────────────────

create or replace function public.admin_upload_promo_codes(
  p_partner_id  uuid,
  p_codes       text[],
  p_batch_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code       text;
  v_clean      text;
  v_inserted   integer := 0;
  v_duplicate  integer := 0;
  v_skipped    integer := 0;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.wallet_partners where id = p_partner_id) then
    raise exception 'partner_not_found' using errcode = 'P0001';
  end if;

  foreach v_code in array coalesce(p_codes, array[]::text[]) loop
    v_clean := btrim(v_code);

    -- A blank line in a pasted CSV is not an error worth failing an upload of
    -- 500 codes over.
    if v_clean = '' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.wallet_promo_codes (partner_id, code, batch_label, created_by)
    values (p_partner_id, v_clean, nullif(btrim(coalesce(p_batch_label, '')), ''), auth.uid())
    on conflict (partner_id, code) do nothing;

    if found then
      v_inserted := v_inserted + 1;
    else
      -- Already in the pool. Re-uploading the same CSV is a normal accident and
      -- must not create a second row that could be issued twice.
      v_duplicate := v_duplicate + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'duplicates', v_duplicate,
    'skipped', v_skipped
  );
end;
$function$;

revoke execute on function public.admin_upload_promo_codes(uuid, text[], text) from public, anon;
grant  execute on function public.admin_upload_promo_codes(uuid, text[], text) to authenticated;

-- ── Stock ────────────────────────────────────────────────────────────────────
-- 4.1 requires the remaining count to be visible BEFORE granting, so nobody
-- comps a membership out of an empty pool and never notices the missing
-- voucher.

create or replace function public.admin_promo_code_stock()
returns table (
  partner_id   uuid,
  partner_slug text,
  partner_name text,
  available    bigint,
  assigned     bigint,
  voided       bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = 'P0001';
  end if;

  return query
    select p.id, p.slug, p.name,
           count(*) filter (where c.assigned_to is null and c.voided_at is null),
           count(*) filter (where c.assigned_to is not null),
           count(*) filter (where c.voided_at is not null)
      from public.wallet_partners p
      join public.wallet_promo_codes c on c.partner_id = p.id
     group by p.id, p.slug, p.name
     order by p.name;
end;
$function$;

revoke execute on function public.admin_promo_code_stock() from public, anon;
grant  execute on function public.admin_promo_code_stock() to authenticated;

-- ── Issuance ─────────────────────────────────────────────────────────────────
-- A new writer to wallet_items, which the architecture allows: one writer per
-- purpose, each SECURITY DEFINER, the client never writing directly. This is
-- the membership-benefit writer.

-- MEMBER_VOUCHER_VALUE is a product decision, not an engineering one -- the
-- same footing as MEMBER_LISTING_LIMIT in 20260911200000. $25 matches the
-- membership price by design (decision 0.1); if one moves, both move.
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

  -- One voucher per membership ROW, not per year. An admin extending a comp
  -- reuses the row, so extending does not issue a second $25. Real renewals
  -- arrive with StoreKit in Phase 5 and will need a term-scoped source_id --
  -- noted at the bottom of this file rather than guessed at now.
  v_source_id := v_membership.id::text;

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

  -- Claim one code. FOR UPDATE SKIP LOCKED so two admins granting at the same
  -- moment take different codes instead of one blocking or -- far worse -- both
  -- reading the same row and issuing it twice.
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

  -- The pool is dry. Deliberately NOT an exception: this function is called
  -- from the membership grant path, and a membership must never fail because a
  -- promo pool ran out. The admin page shows stock before granting and this
  -- reason afterwards, and issuance can be retried once codes are uploaded.
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
    -- The benefit belongs to the term. A perpetual comp (expires_at null)
    -- yields a voucher with no expiry, which is the honest reading of it.
    v_membership.expires_at,
    'membership_benefit', v_source_id
  )
  returning * into v_item;

  update public.wallet_promo_codes set wallet_item_id = v_item.id where id = v_code.id;

  insert into public.wallet_activity (wallet_item_id, user_id, event_type, title, description)
  values (v_item.id, p_user_id, 'granted', v_item.title, 'Issued with membership');

  return jsonb_build_object('issued', true, 'reason', 'issued', 'item_id', v_item.id);
end;
$function$;

-- service_role so the Phase 5 purchase path can call it with no user session,
-- and authenticated so the admin page can retry after topping up the pool.
-- Unlike the admin_* functions this one has no is_admin() gate, because it must
-- be callable by a webhook that has no caller -- so `authenticated` alone would
-- let any signed-in user trigger their own issuance. It is safe only because
-- every branch is guarded by their OWN active membership; a non-member gets
-- 'no_active_membership' and a member gets the voucher they are already owed.
revoke execute on function public.issue_membership_voucher(uuid) from public, anon;
grant  execute on function public.issue_membership_voucher(uuid) to authenticated, service_role;

-- ── Wire it into the grant path (4.2) ───────────────────────────────────────
-- Verbatim re-issue of 20260911180000's admin_grant_membership with exactly one
-- addition: the issuance call, placed before BOTH returns.
--
-- Before the extend-return as well as the insert-return on purpose. If the pool
-- was empty when a membership was first granted, extending it later retries
-- issuance instead of silently leaving the member without the benefit.

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

  -- Extending an existing membership rather than stacking a second one. The
  -- partial unique index would reject the insert anyway; handling it here makes
  -- "grant again to extend" the behaviour instead of an error.
  update public.memberships
     set expires_at   = p_expires_at,
         granted_by   = auth.uid(),
         granted_note = coalesce(p_note, granted_note),
         updated_at   = now()
   where user_id = p_user_id and status = 'active'
   returning * into v_row;

  if found then
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

-- ── What this does not do ───────────────────────────────────────────────────
--
-- **A revoked membership does not recall the code.** Nothing here can: the code
-- is live in Shopify the moment it is cut, and a pool has no way to reach back.
-- The admin can revoke the WALLET ITEM through the existing /admin/wallet
-- control, which removes the member's route to it, but someone who already
-- opened the link keeps a working code. This is the pool's real cost and it is
-- the reason to revisit the Admin API if volume ever justifies credentials.
--
-- **Redemption is invisible.** Without a Shopify webhook we cannot observe that
-- a code was spent, so the item stays 'available' until it expires. Do not add
-- a 'redeemed' display we cannot back up -- that is exactly the contradiction
-- the coach voucher showed before 20260911160000.
--
-- **Renewal issues nothing.** source_id is the membership row, so a second year
-- on the same row gets no second voucher. Correct for admin comps; Phase 5 must
-- decide whether a StoreKit renewal earns another $25 and, if so, key source_id
-- to the term rather than the row.
