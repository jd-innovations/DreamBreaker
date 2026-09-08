// Pure path/URL helpers. No native imports — unit-testable in plain Node.

/**
 * Immutable object id. No uuid dependency: time + randomness is unique enough
 * within a single owner's folder, and filenames are never reused.
 */
export function randomFileId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Extract the storage object path from a Supabase public URL for `bucket`.
 * Returns null when the URL is not a public URL for that bucket (e.g. an
 * external OAuth avatar), signalling "not ours — do not touch".
 *
 *   https://x.supabase.co/storage/v1/object/public/avatars/<uid>/<id>.jpg?v=1
 *     → "<uid>/<id>.jpg"
 */
export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const rest = url.slice(i + marker.length).split('?')[0];
  if (!rest) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/** First path segment (the owner folder) or null. */
export function ownerFolderOf(path: string): string | null {
  const seg = path.split('/')[0];
  return seg || null;
}
