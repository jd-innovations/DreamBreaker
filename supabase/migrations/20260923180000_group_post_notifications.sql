-- Group activity: a new post in your group, and a reply to yours.
--
-- ── Fan-out, and the limit on it ────────────────────────────────────────────
-- A post notifies every other active member, written as ONE insert…select
-- rather than a row-at-a-time loop. The dispatcher trigger still fires per
-- row, so a post in an N-member group costs N push dispatches. Fine at today's
-- scale (largest group: 3 members); somewhere in the hundreds this wants
-- batching — one push that names a group rather than one per member.
--
-- The catalog's 6h throttle already caps how often ONE person can be pushed
-- about group activity, which is the part that would otherwise drive people
-- away. In-app rows are still written every time, because that list is the
-- record of what happened.
--
-- ── What a post says ────────────────────────────────────────────────────────
-- A poll has no body worth quoting and a photo post may have none at all, so
-- the preview describes the kind instead of quoting an empty string.
--
-- ── Replies ─────────────────────────────────────────────────────────────────
-- The post's author hears about a comment, and the parent comment's author
-- hears about a reply to theirs. Someone who is both is told once, and nobody
-- is ever told about their own comment.
--
-- Dry runs: a post notified both other members and not its author; a poll read
-- "started a poll" and a photo post "shared a photo"; a comment reached the
-- post's author only; a reply to a comment produced exactly one notification,
-- to the comment's author.

update public.notification_automations set
  title_template = 'New in {{group_name}}',
  body_template  = '{{author_name}}: {{post_preview}}',
  link_template  = '/groups/{{group_id}}',
  wired = true
where key = 'group_post_new';

update public.notification_automations set
  title_template = '{{author_name}} replied',
  body_template  = '{{post_preview}}',
  link_template  = '/groups/{{group_id}}',
  wired = true
where key = 'group_post_reply';

create or replace function public.fn_notify_group_post()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_group   text;
  v_author  text;
  v_preview text;
  v_copy    record;
begin
  select name into v_group from public.groups where id = new.group_id;
  select full_name into v_author from public.profiles where id = new.author_id;

  v_preview := case
                 when new.kind = 'poll' then 'started a poll'
                 when nullif(btrim(coalesce(new.body, '')), '') is null and new.image_url is not null
                   then 'shared a photo'
                 when nullif(btrim(coalesce(new.body, '')), '') is null then 'posted an update'
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
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_group_post on public.group_posts;
create trigger trg_notify_group_post
  after insert on public.group_posts
  for each row execute function public.fn_notify_group_post();

create or replace function public.fn_notify_group_post_reply()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_group_id uuid;
  v_group    text;
  v_author   text;
  v_preview  text;
  v_copy     record;
begin
  select p.group_id, g.name
    into v_group_id, v_group
    from public.group_posts p
    join public.groups g on g.id = p.group_id
   where p.id = new.post_id;

  select full_name into v_author from public.profiles where id = new.author_id;
  v_preview := left(btrim(coalesce(new.body, 'replied to your post')), 90);

  select * into v_copy from private.render_automation('group_post_reply', jsonb_build_object(
    'group_name',   coalesce(v_group, 'your group'),
    'group_id',     v_group_id::text,
    'author_name',  coalesce(v_author, 'Someone'),
    'post_preview', v_preview
  ));

  -- The post's author, plus the author of the comment being replied to.
  -- DISTINCT so someone who is both is told once, and never about themselves.
  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  select distinct t.user_id,
         'group_post_reply',
         coalesce(v_copy.title, coalesce(v_author, 'Someone') || ' replied'),
         coalesce(v_copy.body, v_preview),
         coalesce(v_copy.link, '/groups/' || v_group_id),
         'group-reply/' || new.id || '/' || t.user_id
    from (
      select p.author_id user_id from public.group_posts p where p.id = new.post_id
      union
      select c.author_id from public.group_post_comments c where c.id = new.parent_comment_id
    ) t
   where t.user_id is not null
     and t.user_id <> new.author_id
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_group_post_reply on public.group_post_comments;
create trigger trg_notify_group_post_reply
  after insert on public.group_post_comments
  for each row execute function public.fn_notify_group_post_reply();
