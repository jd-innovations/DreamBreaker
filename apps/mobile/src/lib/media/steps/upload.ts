// Upload step. THE ONLY file in the pipeline that touches supabase.storage.
// Uses the React-Native-correct FormData mechanism (fetch(file://)→blob is
// unreliable in RN — see the note in lib/groupService.ts). Immutable filenames
// + long Cache-Control so the CDN can cache forever and a replace is a new URL.

import { supabase } from '@/lib/supabase';
import type { CategoryStandard } from '../types';
import { ImageUploadError } from '../types';
import { randomFileId } from '../internal/paths';

export interface UploadedObject {
  url: string;
  path: string;
  bucket: string;
}

export async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ImageUploadError('You must be signed in to upload.');
  return data.user.id;
}

export async function uploadTransformed(
  localUri: string,
  std: CategoryStandard,
  ownerId: string,
  entityId: string,
): Promise<UploadedObject> {
  const ext = std.format === 'webp' ? 'webp' : 'jpg';
  const contentType = std.format === 'webp' ? 'image/webp' : 'image/jpeg';
  const path = `${std.folder({ ownerId, entityId })}/${randomFileId()}.${ext}`;

  const form = new FormData();
  // RN's FormData file shape — cast because the DOM type expects a Blob.
  form.append('file', { uri: localUri, name: `upload.${ext}`, type: contentType } as unknown as Blob);

  const { error } = await supabase.storage.from(std.bucket).upload(path, form, {
    contentType,
    cacheControl: String(std.cacheControl),
    upsert: false,
  });
  if (error) throw new ImageUploadError(error.message, error);

  const { data } = supabase.storage.from(std.bucket).getPublicUrl(path);
  return { url: data.publicUrl, path, bucket: std.bucket };
}

export async function deleteObject(bucket: string, path: string): Promise<void> {
  const { data, error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new ImageUploadError(error.message, error);
  // Supabase returns an empty array with NO error when the object is missing or
  // RLS silently blocks the delete. Treat that as a failure so it surfaces as a
  // warning instead of a phantom success.
  if (!data || data.length === 0) {
    throw new ImageUploadError(
      `Nothing removed at ${bucket}/${path} — object missing or delete blocked by RLS.`,
    );
  }
}
