-- Avatars bucket enforcement (decision D8). The `avatars` bucket was originally
-- created via the Supabase Dashboard and had no migration; this records its
-- upload restrictions in a migration and tightens them to match the
-- ImagePipeline avatar standard.
--
-- Verified 2026-07-23 against the remote project (dreambreaker-pb): the bucket
-- already has correct owner-scoped INSERT/UPDATE/DELETE policies and a public
-- SELECT policy ("Users can delete their own avatar", "Users can upload their
-- own avatar", "Avatar images are publicly readable", "Users can update their
-- own avatar"). Delete-on-replace already works through the existing DELETE
-- policy, so NO storage.objects policy is created here.
--
-- file_size_limit / allowed_mime_types restrict UPLOADS only; existing PNG
-- avatars and their public URLs remain readable. Pre-change remote state was
-- 5 MiB and [jpeg, png, webp, gif]; this narrows to JPEG-only at 2 MiB
-- (2097152 bytes) — generous headroom over a 1024x1024 / q0.8 JPEG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
