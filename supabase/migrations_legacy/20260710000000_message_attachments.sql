-- Adds photo-attachment support to chat messages (1:1 DMs, group chat, and
-- contextual conversations) — previously the messages table was text-only,
-- and the composer's camera icon across the app had no backend to call.

alter table public.messages
  add column attachment_url text,
  add column attachment_type text check (attachment_type is null or attachment_type in ('image'));

-- Body was previously required (not null, 1-2000 chars) for every message.
-- An attachment-only message has no text, so relax both the nullability and
-- the check constraint to require *either* a non-empty body or an attachment.
alter table public.messages alter column body drop not null;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_or_attachment_check
  check (attachment_url is not null or (body is not null and length(body) > 0));
alter table public.messages add constraint messages_body_length_check
  check (body is null or length(body) <= 2000);

-- Storage bucket for message attachment uploads. Public read (same as
-- group-photos) since these are shared to conversation participants who
-- already have the public URL via the message row; upload is scoped to
-- actual conversation participants via the existing is_conversation_participant()
-- helper (covers direct/group/play_event/tournament/team/announcement alike),
-- keyed off the conversation_id path segment set by the client on upload.
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', true)
on conflict (id) do nothing;

create policy "public read message-attachments"
  on storage.objects for select
  using (bucket_id = 'message-attachments');

create policy "participants upload message-attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'message-attachments'
    and public.is_conversation_participant((storage.foldername(name))[1]::uuid, (select auth.uid()))
  );

create policy "senders delete own message-attachments"
  on storage.objects for delete
  using (
    bucket_id = 'message-attachments'
    and owner = (select auth.uid())
  );
