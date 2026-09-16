-- A store event for a user we do not have must be RECORDED, not rejected.
--
-- Found in production 2026-09-16, on the first real deliveries from RevenueCat:
--
--   insert or update on table "membership_store_events"
--   violates foreign key constraint "membership_store_events_user_id_fkey"
--
-- 20260915120000 handled only ONE of the two ways an app_user_id can fail to
-- name a member. A non-uuid (`$RCAnonymousID:...`) was caught by the cast's
-- exception handler and became null. But a well-formed uuid that is not a
-- profiles row sailed past that handler, hit the foreign key on insert, and
-- took the whole transaction down with it -- including the event row that was
-- supposed to preserve the evidence.
--
-- The comment in that migration said the row is still stored so that "an event
-- we could not attribute is the one worth being able to read back". The
-- foreign key made that impossible. This closes the gap the comment claimed
-- was already closed.
--
-- WHY IT MATTERS MORE THAN IT LOOKS: the failure is a 500, and RevenueCat
-- retries 5xx. So an unattributable event does not fail once -- it fails
-- repeatedly, forever, with nothing recorded to show why.
--
-- The uuid is not lost by nulling user_id: app_user_id keeps the raw string
-- verbatim, which is what an admin would search on anyway. Keeping the foreign
-- key is worth more than storing a reference that points at nothing.

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

  perform 1 from public.membership_store_events r where r.id = v_id;

  if found then
    return jsonb_build_object('ok', true, 'reason', 'already_processed', 'event_id', v_id);
  end if;

  v_app_user := v_event ->> 'app_user_id';
  begin
    v_user_id := v_app_user::uuid;
  exception when others then
    v_user_id := null;
  end;

  -- THE FIX. Shape alone is not attribution: a uuid that names no profile is
  -- as unknown as a string that is not a uuid, and both must record rather
  -- than raise.
  if v_user_id is not null then
    perform 1 from public.profiles p where p.id = v_user_id;
    if not found then
      v_user_id := null;
    end if;
  end if;

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

  begin
    if v_type in ('INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE') then

      if v_has_active then
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

      v_result := jsonb_build_object(
        'ok', true, 'action', 'purchase',
        'membership_id', v_membership.id,
        'term_seq', v_membership.term_seq,
        'voucher', public.issue_membership_voucher(v_user_id)
      );

    elsif v_type = 'RENEWAL' then

      if not v_has_active then
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
        v_result := jsonb_build_object(
          'ok', true, 'action', 'renewal',
          'result', public.start_membership_term(v_user_id, v_expires, v_orig_txn)
        );
      end if;

    elsif v_type = 'CANCELLATION' then
      update public.memberships set will_renew = false, updated_at = now()
       where user_id = v_user_id and status = 'active';
      v_result := jsonb_build_object('ok', true, 'action', 'cancellation');

    elsif v_type = 'UNCANCELLATION' then
      update public.memberships set will_renew = true, updated_at = now()
       where user_id = v_user_id and status = 'active';
      v_result := jsonb_build_object('ok', true, 'action', 'uncancellation');

    elsif v_type = 'EXPIRATION' then
      update public.memberships
         set status = 'expired', will_renew = false, updated_at = now()
       where user_id = v_user_id and status = 'active';
      v_result := jsonb_build_object('ok', true, 'action', 'expiration');

    elsif v_type = 'BILLING_ISSUE' then
      v_result := jsonb_build_object('ok', true, 'action', 'billing_issue_noted');

    elsif v_type = 'REFUND' then
      update public.memberships
         set status        = 'revoked',
             will_renew    = false,
             revoked_at    = now(),
             revoke_reason = 'store_refund',
             updated_at    = now()
       where user_id = v_user_id and status = 'active';

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
      v_result := jsonb_build_object('ok', false, 'action', 'transfer_needs_review');

    else
      v_result := jsonb_build_object('ok', true, 'action', 'ignored', 'type', v_type);
    end if;

  exception
    when sqlstate 'P0001' then
      v_result := jsonb_build_object('ok', false, 'reason', sqlerrm);
  end;

  update public.membership_store_events set result = v_result where id = v_id;
  return v_result;
end;
$function$;
