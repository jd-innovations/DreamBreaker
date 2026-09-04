// Coach offer photo upload — thin wrapper around the shared ImagePipeline,
// mirroring apps/mobile/src/lib/marketplace/photos.ts. The create flow needs
// an offer id before the coach_offers row exists (photos upload first,
// publish/save writes the row), so callers generate one client-side and use
// it as both the ImagePipeline entityId and the eventual coach_offers.id.

import * as Crypto from 'expo-crypto';
import { uploadImage, deletePreviousIfOwned } from '@/lib/media';

export function draftCoachOfferId(): string {
  return Crypto.randomUUID();
}

export async function uploadCoachOfferPhoto(uri: string, offerId: string): Promise<string> {
  const result = await uploadImage({ uri, category: 'coachOffer', entityId: offerId });
  return result.url;
}

export async function cleanupAbandonedCoachOfferPhotos(urls: string[], ownerId: string): Promise<void> {
  await Promise.all(urls.map((url) => deletePreviousIfOwned('coachOffer', url, ownerId)));
}
