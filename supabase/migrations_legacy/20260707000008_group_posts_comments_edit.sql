-- Adds edit capability for group posts and comments. Delete was already
-- possible (existing "own or admin delete" policies) but there was no
-- UPDATE policy for either table. edited_at lets the UI show an "Edited"
-- label, matching the Facebook-style edit/delete pattern requested.

alter table public.group_posts add column if not exists edited_at timestamptz null;
alter table public.group_post_comments add column if not exists edited_at timestamptz null;

create policy "group_posts: own update"
  on public.group_posts for update
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "group_post_comments: own update"
  on public.group_post_comments for update
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
