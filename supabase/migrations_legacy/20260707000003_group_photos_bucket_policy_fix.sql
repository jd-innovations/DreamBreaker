-- The initial group-photos upload policy required the path's first folder
-- segment to be a group UUID (is_group_member check), but banner uploads
-- happen before a group exists (no group_id yet) and use a "banners/"
-- prefix — the ::uuid cast would fail. Replaced with the same permissive,
-- bucket-level check already used for tournament-covers; real authorization
-- happens at the groups/group_photos table RLS layer, not storage.

drop policy if exists "group members upload group-photos" on storage.objects;

create policy "authenticated upload group-photos"
  on storage.objects for insert
  with check (bucket_id = 'group-photos');
