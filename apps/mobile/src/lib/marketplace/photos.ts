// Marketplace photo upload — thin wrapper around the shared ImagePipeline
// (uploadImage/deletePreviousIfOwned). The create flow needs a listing id
// before the listing row exists (photos upload first, publish writes the row
// last), so callers generate one client-side via draftListingId() and use it
// as both the ImagePipeline entityId and the eventual marketplace_listings.id.

import * as Crypto from 'expo-crypto';
import { uploadImage, deletePreviousIfOwned } from '@/lib/media';
import { MIN_LISTING_PHOTOS, MAX_LISTING_PHOTOS } from './constants';

export { MIN_LISTING_PHOTOS, MAX_LISTING_PHOTOS };

export function draftListingId(): string {
  return Crypto.randomUUID();
}

export async function uploadListingPhoto(uri: string, listingId: string): Promise<string> {
  const result = await uploadImage({ uri, category: 'marketplace', entityId: listingId });
  return result.url;
}

// Best-effort cleanup for photos uploaded during a create flow the user then
// abandoned — mirrors the ImagePipeline's own "never orphan, never fail loud"
// rollback philosophy (deletePreviousIfOwned swallows its own errors).
export async function cleanupAbandonedPhotos(urls: string[], ownerId: string): Promise<void> {
  await Promise.all(urls.map((url) => deletePreviousIfOwned('marketplace', url, ownerId)));
}
