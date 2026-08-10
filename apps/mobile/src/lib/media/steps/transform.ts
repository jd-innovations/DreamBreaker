// Transform step: orientation-correct (implicit in re-encode) → crop → resize →
// compress. Built against the SDK-54 contextual API (expo-image-manipulator
// ~14). This is the only file that imports the manipulator.
//
// The pipeline honours the category standard regardless of how the caller's
// picker was configured — an avatar is guaranteed square/≤1024/JPEG even if the
// source is a full-frame photo.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { CategoryStandard } from '../types';
import { centredCropRect, cropRatio, resizeToMax } from '../internal/geometry';

export interface TransformResult {
  uri: string;
  width: number;
  height: number;
}

export async function transformImage(
  uri: string,
  std: CategoryStandard,
): Promise<TransformResult> {
  // Probe intrinsic dimensions (re-decoded once; the ref is reused so we don't
  // read from disk twice).
  const probe = await ImageManipulator.manipulate(uri).renderAsync();
  const srcW = probe.width;
  const srcH = probe.height;

  const context = ImageManipulator.manipulate(probe);

  // Crop to the category ratio (skipped for 'none'/'configurable' with no ratio).
  const ratio = cropRatio(std.crop, std.aspectRatio);
  let w = srcW;
  let h = srcH;
  if (ratio != null) {
    const rect = centredCropRect(srcW, srcH, ratio);
    context.crop(rect);
    w = rect.width;
    h = rect.height;
  }

  // Cap the long edge (never upscales).
  const resize = resizeToMax(w, h, std.maxDimension);
  if (resize) context.resize(resize);

  const rendered = await context.renderAsync();
  const format = std.format === 'webp' ? SaveFormat.WEBP : SaveFormat.JPEG;
  const result = await rendered.saveAsync({ compress: std.quality, format });

  return { uri: result.uri, width: result.width, height: result.height };
}
