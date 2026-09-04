-- Public bucket for notification-email shell assets (wordmark + social icons).
--
-- Email clients strip inline SVG, so every glyph in the email shell ships as a
-- PNG on a public URL. Those URLs are embedded in mail that has already left
-- the building, so objects here are effectively permanent: replace artwork by
-- uploading a new -vN name, never by overwriting an existing one.
--
-- Writes are service-role only. Unlike the other public buckets there is no
-- authenticated INSERT policy: nothing in the app uploads here, only the
-- release process (see scripts/build-email-assets.mjs).

INSERT INTO "storage"."buckets"
  ("id", "name", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "type")
VALUES
  ('email-assets', 'email-assets', true, false, 1048576, '{image/png}', 'STANDARD')
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "public" = EXCLUDED."public",
  "avif_autodetection" = EXCLUDED."avif_autodetection",
  "file_size_limit" = EXCLUDED."file_size_limit",
  "allowed_mime_types" = EXCLUDED."allowed_mime_types",
  "type" = EXCLUDED."type",
  "updated_at" = now();

DROP POLICY IF EXISTS "public read email-assets" ON "storage"."objects";
CREATE POLICY "public read email-assets" ON "storage"."objects"
  FOR SELECT USING (("bucket_id" = 'email-assets'::"text"));
