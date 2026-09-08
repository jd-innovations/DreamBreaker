-- Creates the group-photos storage bucket (public read), used by group
-- banners and the Photos tab. Mirrors avatars/tournament-covers, which were
-- created the same way per 20260612000001_initial_schema.sql's convention.

insert into storage.buckets (id, name, public)
values ('group-photos', 'group-photos', true)
on conflict (id) do nothing;

create policy "public read group-photos"
  on storage.objects for select
  using (bucket_id = 'group-photos');

create policy "group members delete own group-photos"
  on storage.objects for delete
  using (
    bucket_id = 'group-photos'
    and owner = (select auth.uid())
  );
