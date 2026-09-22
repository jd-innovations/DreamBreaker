-- Phase B: the social notifications become catalog-driven.
--
-- Group invites, game invites and wallet items already wrote a notifications
-- row — but each trigger built its own wording, so editing the copy in
-- /admin/notifications changed nothing. Each one now renders through
-- private.render_automation, which is what makes the admin screen's editor
-- real for them, and marks them `wired` so they can be switched on.
--
-- Behaviour is otherwise unchanged: same recipients, same idempotency keys,
-- same triggers. If a catalog row were deleted, render_automation returns
-- nothing and each sender falls back to the literal copy it used before.
--
-- ── Deep links ──────────────────────────────────────────────────────────────
-- A push tap resolves through DEEP_LINK_ROOTS (packages/shared/src/deep-link.ts):
-- conversation, groups, tournament, community, marketplace, booking, coach,
-- claim, review — each WITH an id. Two consequences here:
--
--   * the game invite link is /community/<id>, not /games/<id>. The seeded
--     catalog row said /games; the trigger was right and the seed was wrong.
--   * /wallet/<id> does NOT resolve, so a tap on a wallet push opens the app
--     rather than the item. Left as-is and recorded: adding a `wallet` root is
--     a mobile change (ships over the air) and belongs with the other link
--     work, not inside this migration. The in-app notification list navigates
--     by its own routing and is unaffected.

-- Templates aligned to the variables each sender can actually supply. A
-- variable the sender does not pass would otherwise survive into the text as a
-- literal {{token}} — the same failure as the 2026-08-21 email incident.
update public.notification_automations set
  title_template = 'New group invite',
  body_template  = '{{inviter_name}} invited you to join {{group_name}}.',
  link_template  = '/groups/{{group_id}}'
where key = 'group_invite';

update public.notification_automations set
  title_template = 'New game invite 🏓',
  body_template  = '{{inviter_name}} invited you to {{event_name}}. Tap to accept.',
  link_template  = '/community/{{event_id}}'
where key = 'play_event_invite';

update public.notification_automations set
  title_template = 'New in your Wallet',
  body_template  = '{{item_name}} is yours. Tap to see it.',
  link_template  = '/wallet/{{item_id}}'
where key = 'wallet_item_added';

update public.notification_automations set
  title_template = '{{item_name}} is ready',
  body_template  = 'Tap to view your benefit.',
  link_template  = '/wallet/{{item_id}}'
where key = 'wallet_item_available';

-- ── Senders ─────────────────────────────────────────────────────────────────

create or replace function public.notify_group_invite()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_group_name   text;
  v_inviter_name text;
  v_copy         record;
begin
  select name into v_group_name from public.groups where id = new.group_id;
  select full_name into v_inviter_name from public.profiles where id = new.inviter_id;

  select * into v_copy from private.render_automation('group_invite', jsonb_build_object(
    'inviter_name', coalesce(v_inviter_name, 'Someone'),
    'group_name',   coalesce(v_group_name, 'a group'),
    'group_id',     new.group_id::text
  ));

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (
    new.invitee_id,
    'group_invite',
    coalesce(v_copy.title, 'New group invite'),
    coalesce(v_copy.body,
      coalesce(v_inviter_name, 'Someone') || ' invited you to join ' || coalesce(v_group_name, 'a group')),
    coalesce(v_copy.link, '/groups/' || new.group_id),
    'group-invite/' || new.id::text
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
  return new;
end;
$$;

create or replace function public.notify_play_event_invite()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_event_name   text;
  v_inviter_name text;
  v_copy         record;
begin
  select name into v_event_name from public.play_events where id = new.play_event_id;
  select full_name into v_inviter_name from public.profiles where id = new.inviter_id;

  select * into v_copy from private.render_automation('play_event_invite', jsonb_build_object(
    'inviter_name', coalesce(v_inviter_name, 'Someone'),
    'event_name',   coalesce(v_event_name, 'a game'),
    'event_id',     new.play_event_id::text
  ));

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (
    new.invitee_id,
    'play_event_invite',
    coalesce(v_copy.title, 'New game invite'),
    coalesce(v_copy.body,
      coalesce(v_inviter_name, 'Someone') || ' invited you to ' || coalesce(v_event_name, 'a game')),
    coalesce(v_copy.link, '/community/' || new.play_event_id),
    'play-event-invite/' || new.id::text
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
  return new;
end;
$$;

-- Wallet items keep their one real distinction: an item still processing is
-- announced differently from one that is ready. The 'processing' wording stays
-- literal because wallet_item_available covers the ready case moments later,
-- and a second catalog row for a transient state would be noise in the admin
-- list.
create or replace function public.notify_wallet_item_added()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_copy record;
begin
  if new.status = 'processing' then
    insert into public.notifications (user_id, type, title, body, link)
    values (new.user_id, 'wallet_item_added', 'Setting up: ' || new.title, new.subtitle,
            '/wallet/' || new.id::text);
    return new;
  end if;

  select * into v_copy from private.render_automation('wallet_item_added', jsonb_build_object(
    'item_name', new.title,
    'item_id',   new.id::text
  ));

  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.user_id,
    'wallet_item_added',
    coalesce(v_copy.title, 'New in your Wallet: ' || new.title),
    coalesce(v_copy.body, new.subtitle),
    coalesce(v_copy.link, '/wallet/' || new.id::text)
  );
  return new;
end;
$$;

create or replace function public.notify_wallet_item_available()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_copy record;
begin
  if old.status = 'processing' and new.status in ('available', 'active') then
    select * into v_copy from private.render_automation('wallet_item_available', jsonb_build_object(
      'item_name', new.title,
      'item_id',   new.id::text
    ));

    insert into public.notifications (user_id, type, title, body, link)
    values (
      new.user_id,
      'wallet_item_available',
      coalesce(v_copy.title, new.title || ' is ready!'),
      coalesce(v_copy.body, 'Tap to view your benefit.'),
      coalesce(v_copy.link, '/wallet/' || new.id::text)
    );
  end if;
  return new;
end;
$$;

update public.notification_automations
   set wired = true
 where key in ('group_invite', 'play_event_invite', 'wallet_item_added', 'wallet_item_available');
