// ImagePipeline — the single public entry point for every image upload in the
// app. Features call uploadImage / replaceImage with a category; the pipeline
// makes every other decision from IMAGE_STANDARDS.
//
// P0 implements `avatar`. Any other category throws NotImplementedError until
// its phase lands — the API, enums, and config are already permanent so callers
// wired now won't need refactoring later.

import { File } from 'expo-file-system';
import { getStandard } from './imageStandards';
import { validateSource } from './steps/validate';
import { transformImage } from './steps/transform';
import {
  deleteObject,
  getCurrentUserId,
  uploadTransformed,
} from './steps/upload';
import { ownerFolderOf, storagePathFromPublicUrl } from './internal/paths';
import type { ImageCategory, UploadRequest, UploadResult } from './types';
import { NotImplementedError } from './types';

/**
 * Validate → transform (crop/resize/compress) → upload. Returns the public URL
 * and metadata. Does NOT touch any database — the caller owns that.
 */
export async function uploadImage(req: UploadRequest): Promise<UploadResult> {
  const std = getStandard(req.category);
  if (!std.implemented) throw new NotImplementedError(req.category);

  const ownerId = req.ownerId ?? (await getCurrentUserId());
  throwIfAborted(req.signal);

  await validateSource(req.uri, std);
  throwIfAborted(req.signal);

  const transformed = await transformImage(req.uri, std);
  throwIfAborted(req.signal);

  const compressedBytes = safeSize(transformed.uri);
  const object = await uploadTransformed(transformed.uri, std, ownerId, req.entityId);

  return {
    url: object.url,
    variants: {}, // permanent seam — populated by server-side variants later
    width: transformed.width,
    height: transformed.height,
    bytes: compressedBytes,
    path: object.path,
    bucket: object.bucket,
  };
}

/**
 * Safe replace: upload the new object, run the caller's `commit` (the DB write),
 * and only then delete the previous object. Ordering guarantees the record is
 * never pointed at a missing file:
 *   1. upload new  2. commit(result)  3. delete previous (best-effort)
 * If commit throws, the just-uploaded object is rolled back and the error
 * re-thrown, leaving the previous image intact.
 */
export async function replaceImage(
  req: UploadRequest,
  commit: (result: UploadResult) => Promise<void>,
): Promise<UploadResult> {
  const ownerId = req.ownerId ?? (await getCurrentUserId());
  const result = await uploadImage({ ...req, ownerId });

  try {
    await commit(result);
  } catch (err) {
    // Rollback the new object so a failed DB write doesn't orphan it.
    await deleteObject(result.bucket, result.path).catch(() => {});
    throw err;
  }

  if (req.previousUrl) {
    await deletePreviousIfOwned(req.category, req.previousUrl, ownerId);
  }
  return result;
}

/**
 * Delete a previous object only when it lives in this bucket AND inside the
 * owner's folder. External URLs (e.g. OAuth avatars) are skipped. Best-effort:
 * a failed delete never fails the caller — the new image is already live.
 */
export async function deletePreviousIfOwned(
  category: ImageCategory,
  previousUrl: string,
  ownerId: string,
): Promise<void> {
  const std = getStandard(category);
  const path = storagePathFromPublicUrl(previousUrl, std.bucket);
  if (!path) {
    // Not a public URL for this bucket (e.g. an external OAuth avatar).
    console.warn(
      `[ImagePipeline] previous ${category} URL is not a "${std.bucket}" object — skipping delete.`,
    );
    return;
  }
  if (ownerFolderOf(path) !== ownerId) {
    console.warn(
      `[ImagePipeline] previous ${category} object "${path}" is outside the owner's folder — skipping delete.`,
    );
    return;
  }
  try {
    await deleteObject(std.bucket, path);
    console.log(`[ImagePipeline] deleted previous ${category} object "${path}".`);
  } catch (err) {
    console.warn(`[ImagePipeline] failed to delete previous ${category} object`, err);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('Upload cancelled.');
    err.name = 'AbortError';
    throw err;
  }
}

function safeSize(uri: string): number {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}
