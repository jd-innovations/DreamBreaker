-- DreamBreaker PB baseline companion: storage buckets and storage.objects policies.
-- Captured from production without storage.objects rows.

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
  ('tournament-covers', 'tournament-covers', NULL, '2026-06-25 02:40:43.506787+00', '2026-06-25 02:40:43.506787+00', true, false, NULL, NULL, NULL, 'STANDARD'),
  ('group-photos', 'group-photos', NULL, '2026-07-08 00:05:40.038842+00', '2026-07-08 00:05:40.038842+00', true, false, NULL, NULL, NULL, 'STANDARD'),
  ('message-attachments', 'message-attachments', NULL, '2026-07-10 10:19:20.551138+00', '2026-07-10 10:19:20.551138+00', true, false, NULL, NULL, NULL, 'STANDARD'),
  ('avatars', 'avatars', NULL, '2026-06-13 14:21:25.468313+00', '2026-06-13 14:21:25.468313+00', true, false, 2097152, '{image/jpeg}', NULL, 'STANDARD')
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "public" = EXCLUDED."public",
  "avif_autodetection" = EXCLUDED."avif_autodetection",
  "file_size_limit" = EXCLUDED."file_size_limit",
  "allowed_mime_types" = EXCLUDED."allowed_mime_types",
  "type" = EXCLUDED."type",
  "updated_at" = EXCLUDED."updated_at";

DROP POLICY IF EXISTS "Avatar images are publicly readable" ON "storage"."objects";
CREATE POLICY "Avatar images are publicly readable" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'avatars'::"text"));

DROP POLICY IF EXISTS "Users can delete their own avatar" ON "storage"."objects";
CREATE POLICY "Users can delete their own avatar" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'avatars'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));

DROP POLICY IF EXISTS "Users can update their own avatar" ON "storage"."objects";
CREATE POLICY "Users can update their own avatar" ON "storage"."objects" FOR UPDATE USING ((("bucket_id" = 'avatars'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));

DROP POLICY IF EXISTS "Users can upload their own avatar" ON "storage"."objects";
CREATE POLICY "Users can upload their own avatar" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'avatars'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));

DROP POLICY IF EXISTS "authenticated upload group-photos" ON "storage"."objects";
CREATE POLICY "authenticated upload group-photos" ON "storage"."objects" FOR INSERT WITH CHECK (("bucket_id" = 'group-photos'::"text"));

DROP POLICY IF EXISTS "authenticated upload tournament-covers" ON "storage"."objects";
CREATE POLICY "authenticated upload tournament-covers" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK (("bucket_id" = 'tournament-covers'::"text"));

DROP POLICY IF EXISTS "group members delete own group-photos" ON "storage"."objects";
CREATE POLICY "group members delete own group-photos" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'group-photos'::"text") AND ("owner" = ( SELECT "auth"."uid"() AS "uid"))));

DROP POLICY IF EXISTS "participants upload message-attachments" ON "storage"."objects";
CREATE POLICY "participants upload message-attachments" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'message-attachments'::"text") AND "public"."is_conversation_participant"((("storage"."foldername"("name"))[1])::"uuid", ( SELECT "auth"."uid"() AS "uid"))));

DROP POLICY IF EXISTS "public read group-photos" ON "storage"."objects";
CREATE POLICY "public read group-photos" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'group-photos'::"text"));

DROP POLICY IF EXISTS "public read message-attachments" ON "storage"."objects";
CREATE POLICY "public read message-attachments" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'message-attachments'::"text"));

DROP POLICY IF EXISTS "public read tournament-covers" ON "storage"."objects";
CREATE POLICY "public read tournament-covers" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'tournament-covers'::"text"));

DROP POLICY IF EXISTS "senders delete own message-attachments" ON "storage"."objects";
CREATE POLICY "senders delete own message-attachments" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'message-attachments'::"text") AND ("owner" = ( SELECT "auth"."uid"() AS "uid"))));