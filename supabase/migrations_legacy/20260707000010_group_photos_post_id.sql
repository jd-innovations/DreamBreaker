-- Bug: a photo posted to the Feed (Photo compose -> createPhotoPost) created
-- two independent rows — a group_posts row and a group_photos row — with no
-- link between them. Deleting the feed post only removed the group_posts
-- row, so the photo kept showing in the Photos tab.
--
-- Fix: link group_photos to the post that shared it (nullable — direct
-- uploads via the Photos tab's own "Add Photo" button have no post and stay
-- null). ON DELETE CASCADE means deleting the post automatically removes the
-- linked photo row too.

alter table public.group_photos
  add column if not exists post_id uuid references public.group_posts(id) on delete cascade;

create index if not exists idx_group_photos_post on public.group_photos(post_id);
