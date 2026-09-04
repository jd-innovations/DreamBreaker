-- =============================================================================
-- Groups — real backend for the previously fully-mock Groups feature
-- Reuses contextual conversations (conversation_type='group') for chat,
-- play_events.group_id for events, and the same storage-upload pattern as
-- avatars/tournament covers for photos.
--
-- Storage bucket "group-photos" (public read) is created out-of-band via the
-- Supabase management API/dashboard, same convention documented for
-- tournament-covers/player-avatars in 20260612000001_initial_schema.sql.
-- =============================================================================

-- =============================================================================
-- GROUPS
-- =============================================================================

create table public.groups (
  id             uuid        primary key default gen_random_uuid(),
  name           text        not null,
  description    text,
  image_url      text,
  location       text,
  skill          text,
  privacy        text        not null default 'private' check (privacy in ('public', 'private', 'secret')),
  allow_invites  boolean     not null default true,
  allow_posts    boolean     not null default true,
  organizer_id   uuid        not null references public.profiles(id) on delete cascade,
  conversation_id uuid       references public.conversations(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.groups is 'Real backend for the Groups feature (community groups, not Community Play events).';

create index idx_groups_organizer on public.groups(organizer_id);
create index idx_groups_privacy   on public.groups(privacy);

-- =============================================================================
-- GROUP MEMBERS
-- =============================================================================

create table public.group_members (
  group_id  uuid        not null references public.groups(id) on delete cascade,
  user_id   uuid        not null references public.profiles(id) on delete cascade,
  role      text        not null default 'member' check (role in ('owner', 'admin', 'member')),
  status    text        not null default 'active' check (status in ('active', 'pending')),
  joined_at timestamptz not null default now(),

  primary key (group_id, user_id)
);

create index idx_group_members_user on public.group_members(user_id, group_id);

-- Security-definer helper avoids recursive RLS on groups/group_members.
create or replace function public.is_group_member(
  p_group_id uuid,
  p_user_id  uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
     where gm.group_id = p_group_id
       and gm.user_id  = p_user_id
       and gm.status   = 'active'
  );
$$;

create or replace function public.is_group_admin(
  p_group_id uuid,
  p_user_id  uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
     where gm.group_id = p_group_id
       and gm.user_id  = p_user_id
       and gm.status   = 'active'
       and gm.role in ('owner', 'admin')
  );
$$;

-- =============================================================================
-- GROUP EVENTS — reuse the real play_events table
-- =============================================================================

alter table public.play_events
  add column if not exists group_id uuid references public.groups(id) on delete set null;

create index if not exists idx_play_events_group on public.play_events(group_id);

-- =============================================================================
-- GROUP FEED — posts, likes, comments, polls
-- =============================================================================

create table public.group_posts (
  id                   uuid        primary key default gen_random_uuid(),
  group_id             uuid        not null references public.groups(id) on delete cascade,
  author_id            uuid        not null references public.profiles(id) on delete cascade,
  kind                 text        not null default 'post' check (kind in ('post', 'poll')),
  body                 text,
  related_play_event_id uuid       references public.play_events(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index idx_group_posts_group on public.group_posts(group_id, created_at desc);

create table public.group_post_likes (
  post_id uuid not null references public.group_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  primary key (post_id, user_id)
);

create table public.group_post_comments (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.group_posts(id) on delete cascade,
  author_id  uuid        not null references public.profiles(id) on delete cascade,
  body       text        not null,
  created_at timestamptz not null default now()
);

create index idx_group_post_comments_post on public.group_post_comments(post_id, created_at);

create table public.group_poll_options (
  id       uuid primary key default gen_random_uuid(),
  post_id  uuid not null references public.group_posts(id) on delete cascade,
  label    text not null,
  position smallint not null default 0
);

create index idx_group_poll_options_post on public.group_poll_options(post_id);

create table public.group_poll_votes (
  option_id uuid not null references public.group_poll_options(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,

  primary key (option_id, user_id)
);

-- =============================================================================
-- GROUP PHOTOS
-- =============================================================================

create table public.group_photos (
  id          uuid        primary key default gen_random_uuid(),
  group_id    uuid        not null references public.groups(id) on delete cascade,
  uploaded_by uuid        not null references public.profiles(id) on delete cascade,
  url         text        not null,
  created_at  timestamptz not null default now()
);

create index idx_group_photos_group on public.group_photos(group_id, created_at desc);

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.groups              enable row level security;
alter table public.group_members       enable row level security;
alter table public.group_posts         enable row level security;
alter table public.group_post_likes    enable row level security;
alter table public.group_post_comments enable row level security;
alter table public.group_poll_options  enable row level security;
alter table public.group_poll_votes    enable row level security;
alter table public.group_photos        enable row level security;

-- groups ----------------------------------------------------------------------

create policy "groups: read public or member"
  on public.groups for select
  using (
    privacy = 'public'
    or organizer_id = (select auth.uid())
    or public.is_group_member(id, (select auth.uid()))
  );

create policy "groups: organizer insert"
  on public.groups for insert
  with check (organizer_id = (select auth.uid()));

create policy "groups: organizer or admin update"
  on public.groups for update
  using (
    organizer_id = (select auth.uid())
    or public.is_group_admin(id, (select auth.uid()))
  )
  with check (
    organizer_id = (select auth.uid())
    or public.is_group_admin(id, (select auth.uid()))
  );

create policy "groups: organizer delete"
  on public.groups for delete
  using (organizer_id = (select auth.uid()));

-- group_members -----------------------------------------------------------------

create policy "group_members: read member or public group"
  on public.group_members for select
  using (
    public.is_group_member(group_id, (select auth.uid()))
    or exists (select 1 from public.groups g where g.id = group_id and g.privacy = 'public')
    or user_id = (select auth.uid())
  );

create policy "group_members: self join or admin add"
  on public.group_members for insert
  with check (
    user_id = (select auth.uid())
    or public.is_group_admin(group_id, (select auth.uid()))
  );

create policy "group_members: admin update"
  on public.group_members for update
  using (public.is_group_admin(group_id, (select auth.uid())))
  with check (public.is_group_admin(group_id, (select auth.uid())));

create policy "group_members: self leave or admin remove"
  on public.group_members for delete
  using (
    user_id = (select auth.uid())
    or public.is_group_admin(group_id, (select auth.uid()))
  );

-- group_posts ---------------------------------------------------------------

create policy "group_posts: member read"
  on public.group_posts for select
  using (public.is_group_member(group_id, (select auth.uid())));

create policy "group_posts: member insert"
  on public.group_posts for insert
  with check (
    author_id = (select auth.uid())
    and public.is_group_member(group_id, (select auth.uid()))
  );

create policy "group_posts: own or admin delete"
  on public.group_posts for delete
  using (
    author_id = (select auth.uid())
    or public.is_group_admin(group_id, (select auth.uid()))
  );

-- group_post_likes -----------------------------------------------------------

create policy "group_post_likes: member read"
  on public.group_post_likes for select
  using (
    exists (
      select 1 from public.group_posts p
       where p.id = post_id and public.is_group_member(p.group_id, (select auth.uid()))
    )
  );

create policy "group_post_likes: member insert own"
  on public.group_post_likes for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.group_posts p
       where p.id = post_id and public.is_group_member(p.group_id, (select auth.uid()))
    )
  );

create policy "group_post_likes: own delete"
  on public.group_post_likes for delete
  using (user_id = (select auth.uid()));

-- group_post_comments ---------------------------------------------------------

create policy "group_post_comments: member read"
  on public.group_post_comments for select
  using (
    exists (
      select 1 from public.group_posts p
       where p.id = post_id and public.is_group_member(p.group_id, (select auth.uid()))
    )
  );

create policy "group_post_comments: member insert own"
  on public.group_post_comments for insert
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.group_posts p
       where p.id = post_id and public.is_group_member(p.group_id, (select auth.uid()))
    )
  );

create policy "group_post_comments: own or admin delete"
  on public.group_post_comments for delete
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.group_posts p
       where p.id = post_id and public.is_group_admin(p.group_id, (select auth.uid()))
    )
  );

-- group_poll_options / votes ----------------------------------------------------

create policy "group_poll_options: member read"
  on public.group_poll_options for select
  using (
    exists (
      select 1 from public.group_posts p
       where p.id = post_id and public.is_group_member(p.group_id, (select auth.uid()))
    )
  );

create policy "group_poll_options: author insert"
  on public.group_poll_options for insert
  with check (
    exists (
      select 1 from public.group_posts p
       where p.id = post_id
         and p.author_id = (select auth.uid())
         and public.is_group_member(p.group_id, (select auth.uid()))
    )
  );

create policy "group_poll_votes: member read"
  on public.group_poll_votes for select
  using (
    exists (
      select 1 from public.group_poll_options o
        join public.group_posts p on p.id = o.post_id
       where o.id = option_id and public.is_group_member(p.group_id, (select auth.uid()))
    )
  );

create policy "group_poll_votes: member vote own"
  on public.group_poll_votes for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.group_poll_options o
        join public.group_posts p on p.id = o.post_id
       where o.id = option_id and public.is_group_member(p.group_id, (select auth.uid()))
    )
  );

create policy "group_poll_votes: own delete"
  on public.group_poll_votes for delete
  using (user_id = (select auth.uid()));

-- group_photos ----------------------------------------------------------------

create policy "group_photos: member read"
  on public.group_photos for select
  using (public.is_group_member(group_id, (select auth.uid())));

create policy "group_photos: member insert"
  on public.group_photos for insert
  with check (
    uploaded_by = (select auth.uid())
    and public.is_group_member(group_id, (select auth.uid()))
  );

create policy "group_photos: own or admin delete"
  on public.group_photos for delete
  using (
    uploaded_by = (select auth.uid())
    or public.is_group_admin(group_id, (select auth.uid()))
  );

-- =============================================================================
-- conversations: allow real group-chat conversation creation
-- =============================================================================

drop policy if exists "conversations: participants insert" on public.conversations;

create policy "conversations: participants insert"
  on public.conversations for insert
  with check (
    (
      coalesce(conversation_type, 'direct') = 'direct'
      and (participant_a = (select auth.uid()) or participant_b = (select auth.uid()))
      and (
        exists (
          select 1
            from public.partner_likes l1
            join public.partner_likes l2
              on l1.from_user_id = l2.to_user_id
             and l1.to_user_id   = l2.from_user_id
             and l2.kind         = 'like'
           where l1.kind         = 'like'
             and l1.from_user_id in (participant_a, participant_b)
             and l1.to_user_id   in (participant_a, participant_b)
        )
        or exists (
          select 1
            from public.profiles      dir
            join public.tournaments    t   on t.director_id    = dir.id
            join public.registrations  r   on r.tournament_id  = t.id
           where dir.id = (select auth.uid())
             and (dir.role = 'director' or dir.is_director = true)
             and dir.director_status = 'approved'
             and r.player_id in (participant_a, participant_b)
             and r.player_id != (select auth.uid())
             and r.status    in ('held', 'registered', 'checked_in')
        )
        or exists (
          select 1
            from public.registrations  r
            join public.tournaments    t   on t.id = r.tournament_id
           where r.player_id   = (select auth.uid())
             and r.status      in ('held', 'registered', 'checked_in')
             and t.director_id in (participant_a, participant_b)
             and t.director_id != (select auth.uid())
        )
        or exists (
          select 1
            from public.play_events       pe
            join public.play_participants pp on pp.event_id = pe.id
           where pe.organizer_id = (select auth.uid())
             and pp.claimed_by  in (participant_a, participant_b)
             and pp.claimed_by  != (select auth.uid())
        )
        or exists (
          select 1
            from public.play_events pe
           where pe.organizer_id in (participant_a, participant_b)
             and pe.organizer_id != (select auth.uid())
        )
        or exists (
          select 1
            from public.tournaments t
            join public.profiles dir on dir.id = t.director_id
           where t.director_id in (participant_a, participant_b)
             and t.director_id != (select auth.uid())
             and t.status in ('open', 'filling_fast', 'registration_closed', 'in_progress', 'completed')
             and (dir.role = 'director' or dir.is_director = true)
             and dir.director_status = 'approved'
        )
      )
    )
    or (
      conversation_type = 'play_event'
      and created_by = (select auth.uid())
      and related_play_event_id is not null
      and (
        exists (
          select 1 from public.play_events pe
           where pe.id = related_play_event_id
             and pe.organizer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.play_participants pp
           where pp.event_id = related_play_event_id
             and pp.claimed_by = (select auth.uid())
        )
      )
    )
    or (
      conversation_type in ('tournament', 'announcement')
      and created_by = (select auth.uid())
      and related_tournament_id is not null
      and (
        exists (
          select 1 from public.tournaments t
           where t.id = related_tournament_id
             and t.director_id = (select auth.uid())
        )
        or exists (
          select 1 from public.registrations r
           where r.tournament_id = related_tournament_id
             and r.player_id = (select auth.uid())
             and r.status in ('held', 'registered', 'checked_in')
        )
      )
    )
    or (
      conversation_type = 'group'
      and created_by = (select auth.uid())
    )
  );

comment on policy "conversations: participants insert" on public.conversations is
  'Direct: mutual Partner Finder like, tournament director<->registrant, play_event organizer<->claimed participant, anyone<->play_event organizer, or anyone<->visible tournament director. Contextual chats require event/tournament participation. Group: creator = current user, membership enforced separately via group_members/conversation_participants.';
