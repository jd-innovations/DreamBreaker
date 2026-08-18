-- Adds one level of threading to group post comments (reply-to-comment).
-- One level only (replies to replies collapse to the top-level comment),
-- matching the scope of what was asked — not full arbitrary-depth threading.

alter table public.group_post_comments
  add column if not exists parent_comment_id uuid references public.group_post_comments(id) on delete cascade;

create index if not exists idx_group_post_comments_parent on public.group_post_comments(parent_comment_id);
