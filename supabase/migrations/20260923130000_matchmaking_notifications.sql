-- Phase B, finishing the social tier: "it's a match" and "someone liked you".
--
-- ── new_match ───────────────────────────────────────────────────────────────
-- create_partner_match_on_mutual_like already EMAILS both players, and has
-- since 2026-09-08, but writes no in-app notification — so there is nothing for
-- the dispatcher to push, and nothing in the notification list either.
--
-- This adds a separate AFTER INSERT trigger on partner_matches rather than
-- extending that function. The function is the one that creates the match
-- itself and sends both emails; a notification is a different concern, and
-- keeping it out means a mistake here can never stop a match being created.
--
-- ── liked_you ───────────────────────────────────────────────────────────────
-- Nothing has ever told a player someone liked them. The copy deliberately
-- does NOT name the person: matchmaking reveals a name when both sides like
-- each other, and a notification that leaked it early would undo that.
--
-- Fires only when the like is NOT yet mutual — when it is, the pair gets
-- new_match instead, and two notifications for one event is noise.

-- ── It's a match ────────────────────────────────────────────────────────────

create or replace function public.fn_notify_new_match()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_a_name text;
  v_b_name text;
  v_copy   record;
begin
  select full_name into v_a_name from public.profiles where id = new.user_a;
  select full_name into v_b_name from public.profiles where id = new.user_b;

  -- Each player is told about the OTHER one, so the copy is rendered twice.
  select * into v_copy from private.render_automation('new_match', jsonb_build_object(
    'player_name', coalesce(v_b_name, 'another player')
  ));
  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (new.user_a, 'new_match',
          coalesce(v_copy.title, 'It''s a match!'),
          coalesce(v_copy.body, 'You and ' || coalesce(v_b_name, 'another player') || ' both want to play.'),
          coalesce(v_copy.link, '/matchmaking'),
          'new-match/' || new.user_a || '/' || new.user_b)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  select * into v_copy from private.render_automation('new_match', jsonb_build_object(
    'player_name', coalesce(v_a_name, 'another player')
  ));
  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (new.user_b, 'new_match',
          coalesce(v_copy.title, 'It''s a match!'),
          coalesce(v_copy.body, 'You and ' || coalesce(v_a_name, 'another player') || ' both want to play.'),
          coalesce(v_copy.link, '/matchmaking'),
          'new-match/' || new.user_b || '/' || new.user_a)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_match on public.partner_matches;
create trigger trg_notify_new_match
  after insert on public.partner_matches
  for each row execute function public.fn_notify_new_match();

-- ── Someone liked you ───────────────────────────────────────────────────────

create or replace function public.fn_notify_liked_you()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_copy record;
begin
  if new.kind <> 'like' then
    return new;
  end if;

  -- Mutual already? Then this insert is about to produce a match, and
  -- new_match is the better thing to say.
  if exists (
    select 1 from public.partner_likes l
     where l.from_user_id = new.to_user_id
       and l.to_user_id   = new.from_user_id
       and l.kind = 'like'
  ) then
    return new;
  end if;

  -- No variables: naming the liker before the other side likes back would
  -- give away what matchmaking deliberately withholds.
  select * into v_copy from private.render_automation('liked_you', '{}'::jsonb);

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (new.to_user_id, 'liked_you',
          coalesce(v_copy.title, 'Someone wants to play'),
          coalesce(v_copy.body, 'A player near you liked your profile.'),
          coalesce(v_copy.link, '/matchmaking'),
          -- One per liker->liked pair, ever: a like that is withdrawn and
          -- re-sent must not notify twice.
          'liked-you/' || new.from_user_id || '/' || new.to_user_id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_liked_you on public.partner_likes;
create trigger trg_notify_liked_you
  after insert on public.partner_likes
  for each row execute function public.fn_notify_liked_you();

-- The liked_you throttle in the catalog (24h) is what stops a popular player
-- being pinged all day; the idempotency key only stops exact repeats.
update public.notification_automations
   set wired = true
 where key in ('new_match', 'liked_you');
