-- group_invites: specific invitations for Groups.
-- Members may invite when groups.allow_invites is true; admins/owners may always invite.
-- Accepting is handled client-side by inserting/upserting group_members for the invitee.
create table if not exists public.group_invites (
  id           uuid        primary key default gen_random_uuid(),
  group_id     uuid        not null references public.groups(id) on delete cascade,
  inviter_id   uuid        not null references public.profiles(id) on delete cascade,
  invitee_id   uuid        not null references public.profiles(id) on delete cascade,
  status       text        not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (group_id, invitee_id),
  constraint group_invites_no_self_invite check (inviter_id <> invitee_id)
);

create index if not exists idx_group_invites_invitee_status on public.group_invites(invitee_id, status);
create index if not exists idx_group_invites_group_status on public.group_invites(group_id, status);

alter table public.group_invites enable row level security;

create policy "group_invites: sender can invite"
  on public.group_invites for insert
  with check (
    inviter_id = (select auth.uid())
    and not public.is_group_member(group_id, invitee_id)
    and (
      public.is_group_admin(group_id, (select auth.uid()))
      or (
        public.is_group_member(group_id, (select auth.uid()))
        and exists (
          select 1 from public.groups g
           where g.id = group_id
             and g.allow_invites = true
        )
      )
    )
  );

create policy "group_invites: participants can read"
  on public.group_invites for select
  using (
    inviter_id = (select auth.uid())
    or invitee_id = (select auth.uid())
    or public.is_group_admin(group_id, (select auth.uid()))
  );

create policy "group_invites: invitee or inviter can update"
  on public.group_invites for update
  using (
    invitee_id = (select auth.uid())
    or inviter_id = (select auth.uid())
    or public.is_group_admin(group_id, (select auth.uid()))
  )
  with check (
    invitee_id = (select auth.uid())
    or inviter_id = (select auth.uid())
    or public.is_group_admin(group_id, (select auth.uid()))
  );

-- Allow invited users to open private/secret groups from a specific invite link.
create policy "groups: read invited"
  on public.groups for select
  using (
    exists (
      select 1 from public.group_invites gi
       where gi.group_id = id
         and gi.invitee_id = (select auth.uid())
         and gi.status = 'pending'
    )
  );

create or replace function public.notify_group_invite()
returns trigger language plpgsql security definer as $$
declare
  v_group_name text;
  v_inviter_name text;
begin
  select name into v_group_name from public.groups where id = new.group_id;
  select full_name into v_inviter_name from public.profiles where id = new.inviter_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.invitee_id,
    'group_invite',
    'New group invite',
    coalesce(v_inviter_name, 'Someone') || ' invited you to join ' || coalesce(v_group_name, 'a group'),
    '/groups/' || new.group_id
  );
  return new;
end;
$$;

drop trigger if exists group_invite_notify on public.group_invites;
create trigger group_invite_notify
  after insert on public.group_invites
  for each row execute function public.notify_group_invite();