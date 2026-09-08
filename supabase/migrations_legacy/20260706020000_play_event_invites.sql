-- play_event_invites: lets any participant (organizer or joined player) of a
-- Community Play event invite another real user. Accepting joins the invitee
-- as a participant via the existing join_play_event RPC (called client-side).
create table if not exists public.play_event_invites (
  id             uuid        primary key default gen_random_uuid(),
  play_event_id  uuid        not null references public.play_events(id) on delete cascade,
  inviter_id     uuid        not null references public.profiles(id) on delete cascade,
  invitee_id     uuid        not null references public.profiles(id) on delete cascade,
  status         text        not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  unique (play_event_id, invitee_id),
  constraint play_event_invites_no_self_invite check (inviter_id <> invitee_id)
);

alter table public.play_event_invites enable row level security;

-- Inviter must be the event's organizer OR a claimed participant of it.
create policy "inviter_can_send" on public.play_event_invites
  for insert with check (
    auth.uid() = inviter_id
    and (
      exists (select 1 from public.play_events pe where pe.id = play_event_id and pe.organizer_id = auth.uid())
      or exists (select 1 from public.play_participants pp where pp.event_id = play_event_id and pp.claimed_by = auth.uid())
    )
  );

create policy "participants_read" on public.play_event_invites
  for select using (auth.uid() = inviter_id or auth.uid() = invitee_id);

-- Invitee can accept/decline; inviter can cancel their own pending invite.
create policy "invitee_can_respond" on public.play_event_invites
  for update using (auth.uid() = invitee_id or auth.uid() = inviter_id)
  with check (auth.uid() = invitee_id or auth.uid() = inviter_id);

-- Surface invites in the existing notifications table (drives the bell badge).
create or replace function public.notify_play_event_invite()
returns trigger language plpgsql security definer as $$
declare
  v_event_name text;
  v_inviter_name text;
begin
  select name into v_event_name from public.play_events where id = new.play_event_id;
  select full_name into v_inviter_name from public.profiles where id = new.inviter_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.invitee_id,
    'play_event_invite',
    'New game invite',
    coalesce(v_inviter_name, 'Someone') || ' invited you to ' || coalesce(v_event_name, 'a game'),
    '/community/' || new.play_event_id
  );
  return new;
end;
$$;

create trigger play_event_invite_notify
  after insert on public.play_event_invites
  for each row execute function public.notify_play_event_invite();
