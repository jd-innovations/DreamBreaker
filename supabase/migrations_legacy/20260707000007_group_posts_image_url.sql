-- Lets a photo shared to the group also appear as a feed post (not just in
-- the Photos tab). No new "photo" kind needed — a 'post' row with
-- image_url set is enough; body becomes an optional caption.

alter table public.group_posts add column if not exists image_url text null;
