// Permanent ImagePipeline type surface. Every image category the app will ever
// support is enumerated here; only the ones flagged `implemented` in
// imageStandards.ts actually run in P0 (avatar). The rest resolve to a
// NotImplementedError so callers can be wired ahead of the feature landing.

export const IMAGE_CATEGORIES = [
  'avatar',
  'chat',
  'tournamentCover',
  'facility',
  'facilityAsset',
  'marketplace',
  'story',
  'coachOffer',
] as const;

export type ImageCategory = (typeof IMAGE_CATEGORIES)[number];

// How the transform step frames the image before resizing.
//   square       → 1:1 centre crop (avatars)
//   16:9 / 9:16  → fixed-ratio centre crop (covers / stories)
//   none         → preserve source aspect ratio (chat / facility)
//   configurable → caller may request a ratio; falls back to `none`
export type CropMode = 'square' | '16:9' | '9:16' | 'none' | 'configurable';

export type OutputFormat = 'jpeg' | 'webp';

export interface ThumbnailSpec {
  name: string;
  maxDim: number;
  quality: number;
}

export interface FolderContext {
  ownerId: string;
  entityId: string;
}

// The single rule object per category. imageStandards.ts is the only place these
// are constructed; the pipeline reads from here and nowhere else.
export interface CategoryStandard {
  category: ImageCategory;
  /** false ⇒ uploadImage throws NotImplementedError for this category (P0). */
  implemented: boolean;
  bucket: string;
  folder: (ctx: FolderContext) => string;
  filename: 'uuid';
  crop: CropMode;
  /** width/height ratio enforced when crop !== 'none'/'configurable'. */
  aspectRatio: number | null;
  /** long-edge cap in px (never upscales). */
  maxDimension: number;
  /** 0..1 encode quality. */
  quality: number;
  format: OutputFormat;
  /** on-device thumbnail sizes; [] = none. Deferred to P1 for every category. */
  thumbnails: ThumbnailSpec[];
  /** seconds; served as the object's Cache-Control max-age. */
  cacheControl: number;
  /** client-side hard gate on the *source* file, pre-compression. */
  maxUploadBytes: number;
  /** advisory input allow-list (server bucket config is the real gate). */
  allowedMime: string[];
}

export interface UploadRequest {
  uri: string;
  category: ImageCategory;
  entityId: string;
  /** defaults to the current authenticated user. */
  ownerId?: string;
  /** existing remote URL to delete after a successful replace (owner-scoped). */
  previousUrl?: string | null;
  signal?: AbortSignal;
}

export interface UploadResult {
  url: string;
  thumbnailUrl?: string;
  /** server-generated size variants — always {} in P0; the seam is permanent. */
  variants: Record<string, string>;
  width: number;
  height: number;
  bytes: number;
  path: string;
  bucket: string;
}

// Coarse phases only (decision D2 — no byte-level progress in V1).
export type UploadPhase = 'queued' | 'processing' | 'uploading' | 'done' | 'error';

export class NotImplementedError extends Error {
  constructor(public category: ImageCategory) {
    super(
      `ImagePipeline: category "${category}" is not implemented yet (P0 supports 'avatar' only).`,
    );
    this.name = 'NotImplementedError';
  }
}

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

export class ImageUploadError extends Error {
  constructor(
    message: string,
    public override cause?: unknown,
  ) {
    super(message);
    this.name = 'ImageUploadError';
  }
}
