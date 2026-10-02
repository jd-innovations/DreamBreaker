-- Profile bio: at most 300 characters, on every writer (owner, 2026-10-02).
--
-- The limit used to live only in the mobile app (100); web had none and the
-- column is unbounded text. A check constraint applies it to every path —
-- mobile, web, and anything added later — and matches BIO_MAX_LENGTH in
-- packages/shared/src/play-profile.ts.
--
-- Safe to validate immediately: on 2026-10-02 the longest bio was 113
-- characters. The signup trigger does not write bio, so signups are unaffected.

alter table public.profiles
  add constraint profiles_bio_length check (bio is null or char_length(bio) <= 300);
