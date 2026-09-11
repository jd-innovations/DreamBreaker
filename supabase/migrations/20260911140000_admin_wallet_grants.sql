-- Admin-issued wallet promos: grant and revoke, with an audit trail.
--
-- Item 1.2 of MEMBERSHIP_EXECUTION_PLAN.md. Until now exactly one thing could
-- create a wallet item -- create_coach_voucher_from_finalized_purchase(), after
-- a Stripe payment -- so every other type had to be inserted by hand. Six such
-- rows sat in production from 2026-07-20 to 2026-09-11 carrying
-- source_type = 'seed', including a $25 credit with a live link to a partner
-- with no agreement. Nobody could tell who created them or why.
--
-- SECURITY DEFINER, and the client still never writes to wallet_items directly
-- -- that single-writer-per-purpose arrangement is what makes the table
-- trustworthy.
--
-- EXECUTE is granted to `authenticated`, NOT service_role only. is_admin()
-- reads auth.uid(), which is NULL under a service-role client, so a
-- service-role-only grant makes these uncallable: the browser is denied EXECUTE
-- and the server raises admin_only. The gate is the is_admin() check inside,
-- evaluated against the CALLER -- the same shape as admin_delete_tournament and
-- admin_stage_facility_import.
--
-- create_coach_voucher_from_finalized_purchase IS service-role-only, correctly:
-- a Stripe webhook calls it with no user session, so it has no caller to
-- authenticate. Copying that grant here was a mistake, corrected 2026-09-11.
--
-- `anon` is deliberately excluded, unlike admin_payment_reconciliation and
-- issue_review_invitation which both allow it. They are guarded internally too,
-- but a logged-out visitor has no business reaching an admin RPC at all.

-- ── Audit columns ────────────────────────────────────────────────────────────
-- Real columns rather than metadata jsonb: "who gave this person this, and who
-- took it back" is the first question anyone asks of this table, and it should
-- be answerable with a join.

alter table public.wallet_items
  add column if not exists granted_by    uuid references public.profiles(id),
  add column if not exists granted_note  text,
  add column if not exists revoked_by    uuid references public.profiles(id),
  add column if not exists revoked_at    timestamptz,
  add column if not exists revoke_reason text;

comment on column public.wallet_items.granted_by is
  'Admin who issued this item via admin_grant_wallet_item(). Null for items created by a purchase flow.';

-- ── admin_grant_wallet_item ──────────────────────────────────────────────────

create or replace function public.admin_grant_wallet_item(
  p_user_id     uuid,
  p_type        text,
  p_title       text,
  p_source_id   text,
  p_subtitle    text        default null,
  p_description text        default null,
  p_value_label text        default null,
  p_partner_id  uuid        default null,
  p_action_type text        default 'view_details',
  p_action_url  text        default null,
  p_starts_at   timestamptz default null,
  p_expires_at  timestamptz default null,
  p_note        text        default null
)
returns public.wallet_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item public.wallet_items;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = 'P0001';
  end if;

  -- Phase 1 allowlist. `credit` and `membership` are excluded on purpose:
  -- nothing decrements remaining_value_amount and no membership confers
  -- anything, so granting either produces a card that looks like value and does
  -- nothing -- exactly the seeded $25 credit this replaces. `coach_voucher` is
  -- never grantable; it is issued by the purchase path.
  if p_type not in ('offer', 'reward', 'pass', 'ticket') then
    raise exception 'unsupported_wallet_item_type' using errcode = 'P0001';
  end if;

  -- Required so the partial unique index idx_wallet_items_idempotent_source
  -- applies. Without it an admin double-clicking issues two of everything.
  if p_source_id is null or btrim(p_source_id) = '' then
    raise exception 'source_id_required' using errcode = 'P0001';
  end if;

  if p_action_type not in ('external_url', 'internal_route', 'redemption', 'view_details', 'none') then
    raise exception 'invalid_action_type' using errcode = 'P0001';
  end if;

  -- An admin form writes this URL into someone's wallet under a partner's name,
  -- so it is an open redirect with branding attached if left unchecked. The
  -- deleted seeds pointed at real partner sites.
  if p_action_type = 'external_url' then
    if p_action_url is null or p_action_url !~* '^https://' then
      raise exception 'action_url_must_be_https' using errcode = 'P0001';
    end if;
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'expires_at_in_past' using errcode = 'P0001';
  end if;

  insert into public.wallet_items (
    user_id, partner_id, type, status, title, subtitle, description,
    value_label, action_type, action_url, starts_at, expires_at,
    source_type, source_id, granted_by, granted_note
  ) values (
    p_user_id, p_partner_id, p_type, 'available', p_title, p_subtitle, p_description,
    p_value_label, p_action_type, p_action_url, p_starts_at, p_expires_at,
    'admin_grant', btrim(p_source_id), auth.uid(), p_note
  )
  on conflict (user_id, source_type, source_id, type) where source_id is not null
  do nothing
  returning * into v_item;

  -- Conflict: this exact grant already exists. Return it rather than raising --
  -- a retry after a dropped response should be a no-op, not an error.
  if v_item.id is null then
    select * into v_item
      from public.wallet_items
     where user_id = p_user_id
       and source_type = 'admin_grant'
       and source_id = btrim(p_source_id)
       and type = p_type;
    return v_item;
  end if;

  insert into public.wallet_activity (wallet_item_id, user_id, event_type, title, description)
  values (v_item.id, p_user_id, 'granted', p_title, p_note);

  return v_item;
end;
$function$;

revoke execute on function public.admin_grant_wallet_item(
  uuid, text, text, text, text, text, text, uuid, text, text, timestamptz, timestamptz, text
) from public, anon;

grant execute on function public.admin_grant_wallet_item(
  uuid, text, text, text, text, text, text, uuid, text, text, timestamptz, timestamptz, text
) to authenticated;

-- ── admin_revoke_wallet_item ─────────────────────────────────────────────────

create or replace function public.admin_revoke_wallet_item(
  p_item_id uuid,
  p_reason  text default null
)
returns public.wallet_items
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item public.wallet_items;
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = 'P0001';
  end if;

  select * into v_item from public.wallet_items where id = p_item_id;
  if not found then
    raise exception 'wallet_item_not_found' using errcode = 'P0001';
  end if;

  -- A coach voucher represents money that moved through Stripe. Unwinding one
  -- is a refund, not an admin toggle.
  if v_item.type = 'coach_voucher' then
    raise exception 'cannot_revoke_coach_voucher' using errcode = 'P0001';
  end if;

  if v_item.status = 'revoked' then
    return v_item;
  end if;

  -- Never deletes. A hard delete is what made the seeded rows untraceable;
  -- 'revoked' is already an allowed status and the client already renders it as
  -- a red badge in the history section.
  update public.wallet_items
     set status        = 'revoked',
         revoked_by    = auth.uid(),
         revoked_at    = now(),
         revoke_reason = p_reason
   where id = p_item_id
   returning * into v_item;

  insert into public.wallet_activity (wallet_item_id, user_id, event_type, title, description)
  values (v_item.id, v_item.user_id, 'revoked', v_item.title, p_reason);

  return v_item;
end;
$function$;

revoke execute on function public.admin_revoke_wallet_item(uuid, text) from public, anon;

grant execute on function public.admin_revoke_wallet_item(uuid, text) to authenticated;
