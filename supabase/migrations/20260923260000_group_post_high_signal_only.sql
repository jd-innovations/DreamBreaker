-- Group posts: notify only when the post actually asks something of people.
--
-- ── Why the original was wrong ──────────────────────────────────────────────
-- Notifying every member about every post duplicated a feed they were about to
-- scroll anyway, and the 6h throttle only capped PUSHES — the in-app list
-- still filled with one "X posted…" row per member per post, which is exactly
-- the noise that teaches people to ignore the list.
--
-- Owner decision 2026-09-23: only high-signal posts notify. Two kinds qualify,
-- and the schema already distinguishes them:
--
--   kind = 'poll'              a question that needs an answer
--   related_play_event_id      a post about an actual game
--
-- Ordinary chatter is left to the feed, which is where it already lives. The
-- feed IS the record of group activity; a notification is for something that
-- wants a response.
--
-- Replies to your own post are unchanged — that is a direct, personal event.
--
-- ── One refinement ──────────────────────────────────────────────────────────
-- A post about a game skips members who have ALREADY joined it. They know:
-- they are in it. The nudge is for people who have not committed yet, who are
-- the only ones for whom "there is a game on Saturday" is news. Trivially
-- reversible — drop the not-exists clause to tell everyone.
--
-- ── What is still missing ───────────────────────────────────────────────────
-- Groups have no unread tracking at all: no last_read, no seen_at, no badge.
-- That absence is why notifying everyone felt necessary in the first place.
-- Read state plus a badge is the proper fix, and it is product work rather
-- than a notification change — recorded in NOTIFICATIONS_HANDOFF.md.
--
-- Dry runs: an ordinary post notified nobody; a poll notified both other
-- members; a game post notified a member who had not joined; the same post
-- skipped them once they had.

update public.notification_automations set
  name = 'New poll or game post',
  description = 'A poll, or a post about a game, in a group you belong to. Ordinary posts do NOT notify — the group feed is the record of those. A game post skips members who already joined that game.',
  wired = true
where key = 'group_post_new';

create or replace function public.fn_notify_group_post()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_group   text;
  v_author  text;
  v_preview text;
  v_copy    record;
begin
  -- Only posts that ask something of people. Everything else is the feed's job.
  if new.kind is distinct from 'poll' and new.related_play_event_id is null then
    return new;
  end if;

  select name into v_group from public.groups where id = new.group_id;
  select full_name into v_author from public.profiles where id = new.author_id;

  v_preview := case
                 when new.kind = 'poll' then 'started a poll'
                 when nullif(btrim(coalesce(new.body, '')), '') is null then 'posted about a game'
                 else left(btrim(new.body), 90)
               end;

  select * into v_copy from private.render_automation('group_post_new', jsonb_build_object(
    'group_name',   coalesce(v_group, 'your group'),
    'group_id',     new.group_id::text,
    'author_name',  coalesce(v_author, 'Someone'),
    'post_preview', v_preview
  ));

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  select m.user_id,
         'group_post_new',
         coalesce(v_copy.title, 'New in ' || coalesce(v_group, 'your group')),
         coalesce(v_copy.body, coalesce(v_author, 'Someone') || ': ' || v_preview),
         coalesce(v_copy.link, '/groups/' || new.group_id),
         'group-post/' || new.id || '/' || m.user_id
    from public.group_members m
   where m.group_id = new.group_id
     and m.status = 'active'
     and m.user_id <> new.author_id
     -- Already in the game this post is about? Then it is not news.
     and (new.related_play_event_id is null or not exists (
       select 1 from public.play_participants pp
        where pp.event_id = new.related_play_event_id
          and pp.claimed_by = m.user_id
     ))
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;
