// Validation step. P0: presence + source size gate. Output is always re-encoded
// to JPEG downstream, so an unsupported/corrupt input fails at the transform
// step. Magic-byte / MIME sniffing is the permanent extension point here (P1).

import { File } from 'expo-file-system';
import type { CategoryStandard } from '../types';
import { ImageValidationError } from '../types';

export interface ValidationResult {
  /** source file size in bytes (0 when it can't be determined). */
  bytes: number;
}

export async function validateSource(
  uri: string,
  std: CategoryStandard,
): Promise<ValidationResult> {
  if (!uri) throw new ImageValidationError('No image was selected.');

  let bytes = 0;
  try {
    bytes = new File(uri).size ?? 0;
  } catch {
    bytes = 0; // unreadable size is non-fatal; the transform step will surface real failures
  }

  if (bytes > std.maxUploadBytes) {
    const gotMb = (bytes / (1024 * 1024)).toFixed(1);
    const maxMb = Math.round(std.maxUploadBytes / (1024 * 1024));
    throw new ImageValidationError(`That image is too large (${gotMb} MB). Max ${maxMb} MB.`);
  }

  // Extension point (P1): sniff magic bytes and enforce std.allowedMime here.
  return { bytes };
}
