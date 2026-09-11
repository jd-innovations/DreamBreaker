-- Redeeming a coach voucher now updates the wallet item it belongs to.
--
-- redeem_coach_voucher() decremented coach_voucher_entitlements and never
-- touched wallet_items, so the two drifted the moment anyone redeemed:
--
--   coach_voucher_entitlements  remaining_redemptions 0, status 'exhausted'
--   wallet_items                status 'active', redeemed_at null
--
-- The wallet card reads wallet_items and the detail block reads the
-- entitlement, so one screen showed a voucher as both redeemed and active.
-- Observed on the only real voucher in production, redeemed 2026-09-01.
--
-- This is the only function that decrements remaining_redemptions, so writing
-- back here closes the drift for good rather than papering over it in the
-- client. The client also gains a defensive derivation, because a stored status
-- that can lag is exactly what produced this.
--
-- No backfill: the one affected row is test data, and it corrects itself if
-- anything ever touches it.
--
-- Everything else about the function is unchanged -- the guards, the redemption
-- row, the return shape. Only the wallet_items update is added.

create or replace function public.redeem_coach_voucher(p_code text, p_method text default 'qr'::text)
returns table(entitlement_id uuid, offer_title text, buyer_name text, remaining_after integer, total_redemptions integer, fully_redeemed boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_ent   public.coach_voucher_entitlements%rowtype;
  v_title text;
  v_buyer text;
  v_remaining integer;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  if p_method not in ('qr', 'manual') then
    raise exception 'invalid_method';
  end if;

  select * into v_ent
    from public.coach_voucher_entitlements
   where upper(trim(redemption_code)) = upper(trim(p_code))
   for update;

  if not found then
    raise exception 'voucher_not_found';
  end if;

  if v_ent.coach_id <> v_actor then
    raise exception 'not_your_voucher';
  end if;

  if v_ent.status = 'revoked' or v_ent.revoked_at is not null then
    raise exception 'voucher_revoked';
  end if;

  if v_ent.expires_at < now() then
    raise exception 'voucher_expired';
  end if;

  if v_ent.remaining_redemptions <= 0 then
    raise exception 'voucher_already_redeemed';
  end if;

  update public.coach_voucher_entitlements
     set remaining_redemptions = remaining_redemptions - 1,
         exhausted_at = case when remaining_redemptions - 1 = 0 then now() else exhausted_at end,
         status = case when remaining_redemptions - 1 = 0 then 'exhausted' else status end,
         updated_at = now()
   where id = v_ent.id
  returning remaining_redemptions into v_remaining;

  insert into public.coach_voucher_redemptions
    (entitlement_id, purchase_id, offer_id, buyer_id, redeemed_by, method, remaining_after)
  values
    (v_ent.id, v_ent.purchase_id, v_ent.offer_id, v_ent.buyer_id, v_actor, p_method, v_remaining);

  -- The new part.
  --
  -- 'partially_redeemed' when uses remain, 'redeemed' only at zero: a 3-use
  -- voucher down to 2 is not spent, and marking it redeemed would grey out
  -- something still usable. Both statuses already exist in
  -- check_wallet_item_status; nothing set partially_redeemed until now.
  --
  -- redeemed_at is stamped only on exhaustion, so it means "when this was used
  -- up" rather than "when it was last touched".
  --
  -- Guarded on wallet_item_id being present because the column is nullable --
  -- an entitlement without a wallet item is not an error here, just nothing to
  -- update.
  if v_ent.wallet_item_id is not null then
    update public.wallet_items
       set status      = case when v_remaining = 0 then 'redeemed' else 'partially_redeemed' end,
           redeemed_at = case when v_remaining = 0 then now() else redeemed_at end,
           updated_at  = now()
     where id = v_ent.wallet_item_id;

    insert into public.wallet_activity (wallet_item_id, user_id, event_type, title, description)
    values (
      v_ent.wallet_item_id,
      v_ent.buyer_id,
      case when v_remaining = 0 then 'redeemed' else 'partially_redeemed' end,
      coalesce((select o.title from public.coach_offers o where o.id = v_ent.offer_id), 'Lesson'),
      case when v_remaining = 0 then 'Voucher fully redeemed.'
           else v_remaining || ' of ' || v_ent.total_redemptions || ' uses remaining.' end
    );
  end if;

  select o.title into v_title from public.coach_offers o where o.id = v_ent.offer_id;
  select p.full_name into v_buyer from public.profiles p where p.id = v_ent.buyer_id;

  entitlement_id    := v_ent.id;
  offer_title       := coalesce(v_title, 'Lesson');
  buyer_name        := coalesce(v_buyer, 'Player');
  remaining_after   := v_remaining;
  total_redemptions := v_ent.total_redemptions;
  fully_redeemed    := v_remaining = 0;
  return next;
end;
$function$;
