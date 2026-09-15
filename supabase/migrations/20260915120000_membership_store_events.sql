-- Section 4 of MEMBERSHIP_PHASE5_STOREKIT.md: the store webhook's landing zone.
--
-- One SECURITY DEFINER function, service_role only, is the single writer for
-- store-driven membership changes. Same discipline as
-- create_coach_voucher_from_finalized_purchase, and for the same reason: a
-- webhook has no caller to authenticate, so the authorisation has to be the
-- grant itself.
--
-- The route (web/src/app/api/revenuecat/webhook/route.ts) does no business
-- logic at all. It authenticates the request and hands the raw payload here.
-- Keeping the decisions in SQL means the renewal rules cannot drift from
-- admin_renew_membership, which already calls the same start_membership_term().
--
-- THE HAZARD THIS FILE EXISTS TO CONTAIN: every RENEWAL mints a $25 voucher.
-- RevenueCat retries on any non-2xx, and it retries with the same event id.
-- Without idempotency a single slow response would issue vouchers repeatedly.
-- Hence membership_store_events, keyed on RevenueCat's event id, written in
-- the same transaction as the effect.

-- ── Does the member intend to renew? ────────────────────────────────────────
-- CANCELLATION does NOT end entitlement: the member keeps what they paid for
-- until expires_at. It only means Apple will not bill again. Modelling that as
-- status = 'revoked' would take away a term someone already owns, so it gets
-- its own column and is_paid_member() is deliberately left alone.

alter table public.memberships
  add column if not exists will_renew boolean not null default true;

comment on column public.memberships.will_renew is
  'False after a CANCELLATION and true again after an UNCANCELLATION. Display only -- entitlement runs to expires_at either way, and is_paid_member() does not read this.';

-- ── The event log, which is also the idempotency key ────────────────────────

create table if not exists public.membership_store_events (
  -- RevenueCat's event id. Stable across retries of the same event, which is
  -- exactly the property idempotency needs. The store transaction id is NOT
  -- usable as the key: a subscription keeps one original_transaction_id for
  -- life, so every renewal would collide with the first purchase.
  id                      text primary key,

  event_type              text not null,
  app_user_id             text,
  -- Null when the app_user_id is not a uuid we know. The row is still stored:
  -- an event we could not attribute is the one worth being able to read back.
  user_id                 uuid references public.profiles(id) on delete set null,

  product_id              text,
  store                   text,
  environment             text,
  transaction_id          text,
  original_transaction_id text,
  event_at                timestamptz,

  payload                 jsonb not null,
  -- What the handler decided. Null only if a row somehow outlives its handler.
  result                  jsonb,
  received_at             timestamptz not null default now()
);

create index if not exists idx_membership_store_events_user
  on public.membership_store_events (user_id, received_at desc);

comment on table public.membership_store_events is
  'Every store webhook event, and what it did. Doubles as the idempotency ledger: the primary key is RevenueCat''s event id, so a retry cannot re-apply an effect.';

-- No policies, deliberately. Same posture as wallet_promo_codes: the payload
-- carries store identifiers and a member''s purchase history, service_role
-- bypasses RLS to write it, and nothing in the app needs to read it. Admin
-- display, if it is ever wanted, should go through a function that returns a
-- redacted shape rather than a select policy over the raw payload.
alter table public.membership_store_events enable row level security;

-- ── The handler ─────────────────────────────────────────────────────────────

create or replace function public.handle_membership_store_event(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event      jsonb := p_payload -> 'event';
  v_id         text;
  v_type       text;
  v_app_user   text;
  v_user_id    uuid;
  v_expires    timestamptz;
  v_orig_txn   text;
  v_membership public.memberships;
  v_result     jsonb;
  -- Captured explicitly rather than read from FOUND. FOUND is reset by every
  -- intervening SQL statement, so a branch that tests it several statements
  -- after the SELECT is reading whatever ran last.
  v_has_active boolean := false;
begin
  if v_event is null then
    return jsonb_build_object('ok', false, 'reason', 'no_event');
  end if;

  v_id   := v_event ->> 'id';
  v_type := upper(coalesce(v_event ->> 'type', ''));

  if v_id is null or v_type = '' then
    return jsonb_build_object('ok', false, 'reason', 'malformed_event');
  end if;

  -- Idempotency, in two parts. This lookup is only the fast path, for the
  -- ordinary case of a retry arriving after the first attempt finished.
  --
  -- The guard that actually holds is the PRIMARY KEY on the insert below. Two
  -- retries arriving at once would BOTH pass a select-then-act check, and the
  -- second one then fails on the key instead -- uncaught, deliberately, so the
  -- whole transaction rolls back and nothing is issued twice. RevenueCat sees
  -- a 500, retries, and takes this fast path.
  perform 1 from public.membership_store_events r where r.id = v_id;

  if found then
    return jsonb_build_object('ok', true, 'reason', 'already_processed', 'event_id', v_id);
  end if;

  -- app_user_id IS the Supabase user id, because the client calls
  -- Purchases.logIn(session.user.id). Anything else is an anonymous RevenueCat
  -- id, which means the client skipped that call -- worth recording loudly
  -- rather than guessing at a member.
  v_app_user := v_event ->> 'app_user_id';
  begin
    v_user_id := v_app_user::uuid;
  exception when others then
    v_user_id := null;
  end;

  if (v_event ->> 'expiration_at_ms') is not null then
    v_expires := to_timestamp((v_event ->> 'expiration_at_ms')::bigint / 1000.0);
  end if;
  v_orig_txn := v_event ->> 'original_transaction_id';

  insert into public.membership_store_events (
    id, event_type, app_user_id, user_id, product_id, store, environment,
    transaction_id, original_transaction_id, event_at, payload
  ) values (
    v_id, v_type, v_app_user, v_user_id,
    v_event ->> 'product_id', v_event ->> 'store', v_event ->> 'environment',
    v_event ->> 'transaction_id', v_orig_txn,
    case when (v_event ->> 'event_timestamp_ms') is not null
         then to_timestamp((v_event ->> 'event_timestamp_ms')::bigint / 1000.0)
         else now() end,
    p_payload
  );

  if v_user_id is null then
    v_result := jsonb_build_object('ok', false, 'reason', 'unknown_app_user_id');
    update public.membership_store_events set result = v_result where id = v_id;
    return v_result;
  end if;

  select * into v_membership
    from public.memberships
   where user_id = v_user_id and status = 'active'
   for update;

  v_has_active := found;

  -- ── Dispatch ──────────────────────────────────────────────────────────────
  begin
    if v_type in ('INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE') then

      if v_has_active then
        -- Already entitled -- typically an admin comp that has now been paid
        -- for. Take the later of the two expiries so buying never shortens
        -- what someone already had, and adopt the store as the source of
        -- truth from here. No term increment: this is the same term, now paid.
        --
        -- expires_at: a perpetual comp (null) STAYS null. Taking the store's
        -- date there would quietly convert "never expires" into "expires in a
        -- year" -- buying a membership must never shorten one.
        update public.memberships
           set source                = 'iap',
               external_reference_id = coalesce(v_orig_txn, external_reference_id),
               expires_at            = case
                                         when expires_at is null then null
                                         when v_expires is null  then expires_at
                                         else greatest(expires_at, v_expires)
                                       end,
               will_renew            = true,
               updated_at            = now()
         where id = v_membership.id
         returning * into v_membership;

        update public.wallet_items
           set expires_at = v_membership.expires_at
         where user_id = v_user_id
           and source_type = 'membership_benefit'
           and source_id = v_membership.id::text || ':' || v_membership.term_seq::text
           and status = 'available';
      else
        insert into public.memberships (
          user_id, source, expires_at, external_reference_id, will_renew
        ) values (
          v_user_id, 'iap', v_expires, v_orig_txn, true
        )
        returning * into v_membership;
      end if;

      -- Idempotent per term: a second call for the same term issues nothing.
      v_result := jsonb_build_object(
        'ok', true, 'action', 'purchase',
        'membership_id', v_membership.id,
        'term_seq', v_membership.term_seq,
        'voucher', public.issue_membership_voucher(v_user_id)
      );

    elsif v_type = 'RENEWAL' then

      if not v_has_active then
        -- Renewing something we never recorded. Treat it as the purchase we
        -- missed rather than dropping a paid term on the floor.
        insert into public.memberships (
          user_id, source, expires_at, external_reference_id, will_renew
        ) values (
          v_user_id, 'iap', v_expires, v_orig_txn, true
        )
        returning * into v_membership;

        v_result := jsonb_build_object(
          'ok', true, 'action', 'renewal_created_membership',
          'membership_id', v_membership.id,
          'voucher', public.issue_membership_voucher(v_user_id)
        );
      else
        -- The shared core, the same one admin_renew_membership calls. It
        -- increments term_seq and issues that term's voucher, and it refuses
        -- an expiry that does not move forward -- which is the second line of
        -- defence behind the idempotency key above.
        v_result := jsonb_build_object(
          'ok', true, 'action', 'renewal',
          'result', public.start_membership_term(v_user_id, v_expires, v_orig_txn)
        );
      end if;

    elsif v_type = 'CANCELLATION' then
      -- Entitlement is untouched on purpose. See will_renew's comment.
      update public.memberships set will_renew = false, updated_at = now()
       where user_id = v_user_id and status = 'active';
      v_result := jsonb_build_object('ok', true, 'action', 'cancellation');

    elsif v_type = 'UNCANCELLATION' then
      update public.memberships set will_renew = true, updated_at = now()
       where user_id = v_user_id and status = 'active';
      v_result := jsonb_build_object('ok', true, 'action', 'uncancellation');

    elsif v_type = 'EXPIRATION' then
      -- Cosmetic, strictly: is_paid_member() already stops honouring a row
      -- past expires_at with nothing running. This is so admin screens and
      -- fetchMembership agree with what the member sees.
      update public.memberships
         set status = 'expired', will_renew = false, updated_at = now()
       where user_id = v_user_id and status = 'active';
      v_result := jsonb_build_object('ok', true, 'action', 'expiration');

    elsif v_type = 'BILLING_ISSUE' then
      -- Apple retries for days. Revoking here would take entitlement away from
      -- someone whose card simply needs updating, and EXPIRATION is what
      -- arrives if the retries genuinely fail.
      v_result := jsonb_build_object('ok', true, 'action', 'billing_issue_noted');

    elsif v_type = 'REFUND' then
      update public.memberships
         set status        = 'revoked',
             will_renew    = false,
             revoked_at    = now(),
             revoke_reason = 'store_refund',
             updated_at    = now()
       where user_id = v_user_id and status = 'active';

      -- The voucher goes with it -- but only THIS term's, and only if it is
      -- still unredeemed. Two limits, both deliberate:
      --
      --   Apple refunds one transaction, so year one's voucher is not forfeit
      --   because year two was refunded. Hence the source_id scope.
      --
      --   A code already opened cannot be recalled (section 6 of the plan), so
      --   marking a redeemed item revoked would only make our records disagree
      --   with Shopify's. Hence status = 'available'.
      if v_has_active then
        update public.wallet_items
           set status        = 'revoked',
               revoked_at    = now(),
               revoke_reason = 'membership refunded'
         where user_id = v_user_id
           and source_type = 'membership_benefit'
           and source_id = v_membership.id::text || ':' || v_membership.term_seq::text
           and status = 'available';
      end if;

      v_result := jsonb_build_object('ok', true, 'action', 'refund');

    elsif v_type = 'TRANSFER' then
      -- Apple moved the subscription to another Apple ID. RevenueCat names the
      -- losing ids in transferred_from and the gaining ones in transferred_to.
      -- Not handled automatically: it is rare, it is ambiguous when the two
      -- sides are different app accounts, and getting it wrong either strips a
      -- paying member or hands entitlement to the wrong person. Recorded for an
      -- admin to action.
      v_result := jsonb_build_object('ok', false, 'action', 'transfer_needs_review');

    else
      v_result := jsonb_build_object('ok', true, 'action', 'ignored', 'type', v_type);
    end if;

  exception
    -- Only the handled, logical refusals. These are final answers, not
    -- transient faults, so they are recorded and the event is ACKed --
    -- retrying them would produce the same refusal forever.
    when sqlstate 'P0001' then
      v_result := jsonb_build_object('ok', false, 'reason', sqlerrm);
  end;

  update public.membership_store_events set result = v_result where id = v_id;
  return v_result;
end;
$function$;

-- The whole authorisation model for this function. A webhook arrives with no
-- user session, so nothing weaker than "only the service role may call it"
-- would mean anything -- and anything stronger would lock out the only caller.
revoke execute on function public.handle_membership_store_event(jsonb)
  from public, anon, authenticated;
grant  execute on function public.handle_membership_store_event(jsonb)
  to service_role;

comment on function public.handle_membership_store_event(jsonb) is
  'Single writer for store-driven membership changes. Idempotent on the RevenueCat event id. service_role only -- the caller is a webhook with no user session.';
