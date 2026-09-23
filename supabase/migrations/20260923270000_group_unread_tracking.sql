-- Unread state for groups, so activity is visible without a notification.
--
-- Groups had no read tracking of any kind: no last_read, no seen_at, no badge.
-- That gap is why every post used to notify every member — the notification
-- was standing in for a badge. With this, a group shows what is new, and
-- notifications go back to being for things that ask something of you
-- (20260923260000 cut them to polls and game posts).
--
-- ── What counts as unread ───────────────────────────────────────────────────
-- Any feed activity since you last opened the group, by someone other than
-- you: posts and comments both. Your own writing is never unread to you, and a
-- member who has never opened a group counts from joined_at — not from the
-- whole history, which would badge a new member with everything ever posted.
--
-- ── Where the time lives ────────────────────────────────────────────────────
-- group_members.last_read_at: one column on a table the app already loads.
--
-- Dry runs: nothing since last read counted 0; two posts and a comment by
-- someone else counted 3; my own post did not add to it; opening the group
-- cleared it; a member who had just joined saw 0 while one who joined two
-- hours earlier saw the 3 posted since.

alter table public.group_members
  add column if not exists last_read_at timestamptz;

comment on column public.group_members.last_read_at is
  'When this member last opened the group. NULL means never — unread is then '
  'counted from joined_at, so a new member is not badged with the whole '
  'history. Written by mark_group_read().';

create index if not exists group_posts_group_created_idx
  on public.group_posts (group_id, created_at desc);

-- ── Marking read ────────────────────────────────────────────────────────────
-- Called when the group screen opens. Idempotent and cheap, and it only moves
-- forward, so a stale call from a backgrounded screen cannot un-read a group.

create or replace function public.mark_group_read(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.group_members
     set last_read_at = now()
   where group_id = p_group_id
     and user_id = auth.uid()
     and (last_read_at is null or last_read_at < now());
end;
$$;

revoke all on function public.mark_group_read(uuid) from public, anon;
grant execute on function public.mark_group_read(uuid) to authenticated;

-- ── Counting what is new ────────────────────────────────────────────────────
-- One row per group the caller belongs to, so the groups list badges every
-- card from a single request.

create or replace function public.group_unread_counts()
returns table (group_id uuid, unread_count integer)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.group_id, coalesce(m.last_read_at, m.joined_at) since
      from public.group_members m
     where m.user_id = auth.uid()
       and m.status = 'active'
       and auth.uid() is not null
  )
  select mine.group_id,
         (
           (select count(*)
              from public.group_posts p
             where p.group_id = mine.group_id
               and p.created_at > mine.since
               and p.author_id <> auth.uid())
           +
           (select count(*)
              from public.group_post_comments c
              join public.group_posts p2 on p2.id = c.post_id
             where p2.group_id = mine.group_id
               and c.created_at > mine.since
               and c.author_id <> auth.uid())
         )::integer
    from mine;
$$;

revoke all on function public.group_unread_counts() from public, anon;
grant execute on function public.group_unread_counts() to authenticated;
