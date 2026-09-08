-- Widens message attachments from camera-only images to also support photo
-- library picks and arbitrary files. attachment_type gains 'file'; a new
-- attachment_name column carries the original filename (images from camera/
-- library rarely have a meaningful one, but files do and the bubble UI needs
-- it to render something other than a bare URL).

alter table public.messages add column attachment_name text;

alter table public.messages drop constraint if exists messages_attachment_type_check;
alter table public.messages add constraint messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'file'));
