-- Narrow the window the moderation escape hatch is open for.
--
-- set_config('app.coach_moderation', 'on', true) is TRANSACTION-local, not
-- statement-local. In production each RPC call is its own transaction, so the
-- flag dies with it and nothing is exposed. But inside one transaction that
-- calls a moderation RPC and then does something else — a future batch tool, a
-- test, a function wrapping several removals — the guard stays disabled for
-- everything that follows. That is how a guard quietly stops guarding.
--
-- Found while dry-running Phase 2: a "can the coach undo this?" check PASSED
-- when it should have failed, purely because the removal earlier in the same
-- transaction had left the flag on. Re-tested afterwards: the coach now hits
-- offer_removed_by_admin even in the same transaction as the removal.
--
-- The marketplace equivalents (20260922160000) share the pattern and the same
-- latent issue. Left alone deliberately rather than widening this migration —
-- recorded here and in COACH_MARKETPLACE_HANDOFF.md so it is not discovered
-- twice.
--
-- Bodies are otherwise identical to 20260923310000; only the two
-- set_config(... 'off' ...) lines are new.

create or replace function public.admin_remove_coach_offer(p_offer_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_coach uuid;
  v_title text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select coach_id, title into v_coach, v_title from public.coach_offers where id = p_offer_id;
  if v_coach is null then
    raise exception 'offer_not_found' using errcode = 'P0002';
  end if;

  perform set_config('app.coach_moderation', 'on', true);

  update public.coach_offers
     set status = 'archived', removed_at = now(), updated_at = now()
   where id = p_offer_id
     and removed_at is null;

  -- Closed again immediately: the guard protects every later statement in this
  -- transaction, not just the ones outside it.
  perform set_config('app.coach_moderation', 'off', true);

  insert into public.coach_offer_moderation_log (offer_id, actor_id, action, reason)
  values (p_offer_id, v_actor, 'removed', v_reason);

  insert into public.notifications (user_id, type, title, body, link)
  values (v_coach, 'coach_offer_removed',
          'Your lesson was removed',
          '"' || left(coalesce(v_title, 'Your lesson'), 80) || '" was removed by the Pickleball App team: ' || v_reason,
          null);
end;
$$;

create or replace function public.admin_restore_coach_offer(p_offer_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_coach uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select coach_id into v_coach from public.coach_offers where id = p_offer_id and removed_at is not null;
  if v_coach is null then
    raise exception 'offer_not_removed' using errcode = 'P0002';
  end if;

  perform set_config('app.coach_moderation', 'on', true);

  update public.coach_offers
     set removed_at = null, status = 'paused', updated_at = now()
   where id = p_offer_id;

  perform set_config('app.coach_moderation', 'off', true);

  insert into public.coach_offer_moderation_log (offer_id, actor_id, action, reason)
  values (p_offer_id, v_actor, 'restored', null);

  insert into public.notifications (user_id, type, title, body, link)
  values (v_coach, 'coach_offer_restored',
          'Your lesson is back',
          'It is paused so you can review it before it goes live again.',
          '/coach/offers');

  return 'paused';
end;
$$;
