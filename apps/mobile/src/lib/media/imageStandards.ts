// Central image standards — the single source of truth for every category.
// The pipeline reads ONLY from this file. To change avatar dimensions/quality,
// change it here; no feature screen holds any of these values.
//
// P0 implements `avatar` only. Every other category is fully described (so the
// public API, buckets, and transform rules are permanent) but flagged
// `implemented: false` until its phase lands. Bucket names for unimplemented
// categories are the intended targets and may not exist server-side yet.

import type { CategoryStandard, ImageCategory } from './types';

const ONE_YEAR = 31_536_000; // seconds
const MB = 1024 * 1024;

export const IMAGE_STANDARDS: Record<ImageCategory, CategoryStandard> = {
  avatar: {
    category: 'avatar',
    implemented: true,
    bucket: 'avatars',
    folder: ({ ownerId }) => ownerId,
    filename: 'uuid',
    crop: 'square',
    aspectRatio: 1,
    maxDimension: 1024,
    quality: 0.8,
    format: 'jpeg',
    thumbnails: [],
    cacheControl: ONE_YEAR,
    maxUploadBytes: 15 * MB,
    allowedMime: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  },

  chat: {
    category: 'chat',
    implemented: false,
    bucket: 'message-attachments',
    folder: ({ ownerId, entityId }) => `${ownerId}/${entityId}`,
    filename: 'uuid',
    crop: 'none',
    aspectRatio: null,
    maxDimension: 1600,
    quality: 0.7,
    format: 'jpeg',
    thumbnails: [],
    cacheControl: ONE_YEAR,
    maxUploadBytes: 25 * MB,
    allowedMime: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  },

  tournamentCover: {
    category: 'tournamentCover',
    implemented: false,
    bucket: 'tournament-covers',
    folder: ({ ownerId, entityId }) => `${ownerId}/${entityId}`,
    filename: 'uuid',
    crop: '16:9',
    aspectRatio: 16 / 9,
    maxDimension: 1920,
    quality: 0.85,
    format: 'jpeg',
    thumbnails: [{ name: 'thumb', maxDim: 400, quality: 0.7 }],
    cacheControl: ONE_YEAR,
    maxUploadBytes: 25 * MB,
    allowedMime: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  },

  facility: {
    category: 'facility',
    implemented: false,
    bucket: 'group-photos',
    folder: ({ ownerId, entityId }) => `${ownerId}/${entityId}`,
    filename: 'uuid',
    crop: 'none',
    aspectRatio: null,
    maxDimension: 1600,
    quality: 0.75,
    format: 'jpeg',
    thumbnails: [{ name: 'thumb', maxDim: 400, quality: 0.7 }],
    cacheControl: ONE_YEAR,
    maxUploadBytes: 25 * MB,
    allowedMime: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  },

  facilityAsset: {
    category: 'facilityAsset',
    implemented: true,
    bucket: 'facility-assets',
    // ownerId = facility_id, entityId = court/ball-machine id. Storage RLS
    // (20260809000000_booking_engine_phase1_facility_foundation.sql) checks
    // folder[1] against facility_members via is_facility_role_at_least, so
    // ownerId MUST be the facility_id — never the uploading user's id.
    folder: ({ ownerId, entityId }) => `${ownerId}/${entityId}`,
    filename: 'uuid',
    crop: 'none',
    aspectRatio: null,
    maxDimension: 1600,
    quality: 0.8,
    format: 'jpeg',
    thumbnails: [{ name: 'thumb', maxDim: 400, quality: 0.7 }],
    cacheControl: ONE_YEAR,
    maxUploadBytes: 25 * MB,
    allowedMime: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  },

  marketplace: {
    category: 'marketplace',
    implemented: true,
    bucket: 'marketplace',
    folder: ({ ownerId, entityId }) => `${ownerId}/${entityId}`,
    filename: 'uuid',
    crop: 'configurable',
    aspectRatio: null,
    maxDimension: 1600,
    quality: 0.8,
    format: 'jpeg',
    thumbnails: [{ name: 'thumb', maxDim: 400, quality: 0.7 }],
    cacheControl: ONE_YEAR,
    maxUploadBytes: 25 * MB,
    allowedMime: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  },

  coachOffer: {
    category: 'coachOffer',
    implemented: true,
    bucket: 'coach-offers',
    folder: ({ ownerId, entityId }) => `${ownerId}/${entityId}`,
    filename: 'uuid',
    crop: 'configurable',
    aspectRatio: null,
    maxDimension: 1600,
    quality: 0.8,
    format: 'jpeg',
    thumbnails: [{ name: 'thumb', maxDim: 400, quality: 0.7 }],
    cacheControl: ONE_YEAR,
    maxUploadBytes: 25 * MB,
    allowedMime: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  },

  story: {
    category: 'story',
    implemented: false,
    bucket: 'stories',
    folder: ({ ownerId }) => ownerId,
    filename: 'uuid',
    crop: '9:16',
    aspectRatio: 9 / 16,
    maxDimension: 1920,
    quality: 0.75,
    format: 'jpeg',
    thumbnails: [],
    cacheControl: ONE_YEAR,
    maxUploadBytes: 25 * MB,
    allowedMime: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  },
};

export function getStandard(category: ImageCategory): CategoryStandard {
  const std = IMAGE_STANDARDS[category];
  if (!std) throw new Error(`ImagePipeline: unknown image category "${category}".`);
  return std;
}
