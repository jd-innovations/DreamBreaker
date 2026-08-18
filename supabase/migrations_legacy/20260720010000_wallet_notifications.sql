-- =============================================================================
-- DreamBreaker PB — Wallet notifications
-- Migration: 20260720010000_wallet_notifications
--
-- Notifies the owning user (via the existing public.notifications table) when:
--   1. A new wallet_items row is created for them.
--   2. A wallet_items row transitions out of 'processing' into a usable state.
--
-- Follows the existing notify_play_event_invite() / notify_group_invite()
-- pattern: security definer trigger functions, since wallet_items RLS (like
-- notifications' insert policy) does not allow direct client writes.
-- =============================================================================

create or replace function public.notify_wallet_item_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.user_id,
    'wallet_item_added',
    case
      when new.status = 'processing' then 'Setting up: ' || new.title
      else 'New in your Wallet: ' || new.title
    end,
    new.subtitle,
    '/wallet/' || new.id::text
  );
  return new;
end;
$$;

comment on function public.notify_wallet_item_added is
  'Notifies the owning user when a wallet_items row is created for them.';

create trigger trg_notify_wallet_item_added
  after insert on public.wallet_items
  for each row execute function public.notify_wallet_item_added();


create or replace function public.notify_wallet_item_available()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'processing' and new.status in ('available', 'active') then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      new.user_id,
      'wallet_item_available',
      new.title || ' is ready!',
      'Tap to view your benefit.',
      '/wallet/' || new.id::text
    );
  end if;
  return new;
end;
$$;

comment on function public.notify_wallet_item_available is
  'Notifies the owning user when a wallet_items row finishes issuing (processing -> available/active).';

create trigger trg_notify_wallet_item_available
  after update of status on public.wallet_items
  for each row execute function public.notify_wallet_item_available();
