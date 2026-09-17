// Cover-photo upload for Community Play events. Targets the same
// `tournament-covers` storage bucket and `play-events/{userId}/...` path
// convention mobile uses (apps/mobile/src/lib/supabase/playEvents.ts,
// uploadPlayEventCover) so cover images are interchangeable regardless of
// which platform created the event.

import { createClient } from "@/lib/supabase/client";

export async function uploadEventCover(userId: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || (file.type.split("/")[1] ?? "jpg");
  const path = `play-events/${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("tournament-covers")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from("tournament-covers").getPublicUrl(path);
  return data.publicUrl;
}
