-- partner_likes: tracks likes (right swipe) and saves (star button)
create table if not exists public.partner_likes (
  id           uuid        primary key default gen_random_uuid(),
  from_user_id uuid        not null references public.profiles(id) on delete cascade,
  to_user_id   uuid        not null references public.profiles(id) on delete cascade,
  kind         text        not null check (kind in ('like', 'save')),
  created_at   timestamptz not null default now(),
  unique (from_user_id, to_user_id, kind)
);

alter table public.partner_likes enable row level security;

-- users manage their own likes/saves; can read rows where they are the recipient (needed for mutual match in Slice 5)
create policy "owner_insert_delete" on public.partner_likes
  for all using (auth.uid() = from_user_id) with check (auth.uid() = from_user_id);

create policy "recipient_read" on public.partner_likes
  for select using (auth.uid() = to_user_id);
