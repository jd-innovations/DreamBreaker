import { Asset } from 'expo-asset';

// Single source of truth for the play-event cover image.
//
// Organizers may upload their own cover; when they don't, `cover_url` stays
// null and every surface renders this bundled court photo instead. We do NOT
// upload a copy of the default per event — that duplicated a ~315 KB asset for
// every cover-less event and depended on a fragile expo-asset → FormData path
// (asset.localUri is sometimes null in dev, leaving an http:// dev-server URL
// that React Native's multipart upload cannot read, so the upload failed
// silently and the event ended up with no cover at all).
const DEFAULT_EVENT_COVER_ASSET = require('../../assets/images/default-court-cover.jpg');

/** Bundled default as an RN image source (for `<Image source={...} />`). */
export const DEFAULT_EVENT_COVER = DEFAULT_EVENT_COVER_ASSET;

/**
 * The same bundled photo, named for callers that are not events - the facility
 * detail hero shows it when a facility has no photo of its own. Aliased rather
 * than duplicated so there is still one file to swap when the artwork changes.
 */
export const DEFAULT_COURT_COVER = DEFAULT_EVENT_COVER_ASSET;

// Resolved lazily and defensively: this module is imported by screens that are
// also server-rendered for web, where asset resolution differs. Never resolve
// at module scope — a throw there takes down the whole render.
let cachedUri: string | null = null;

/** Bundled default as a URI string, for call sites passing plain `string` photos. */
export function defaultEventCoverUri(): string {
  if (cachedUri !== null) return cachedUri;
  try {
    cachedUri = Asset.fromModule(DEFAULT_EVENT_COVER_ASSET).uri ?? '';
  } catch {
    cachedUri = '';
  }
  return cachedUri;
}

/** The organizer's cover when present, otherwise the bundled court default. */
export function eventCoverUri(coverUrl?: string | null): string {
  return coverUrl && coverUrl.length > 0 ? coverUrl : defaultEventCoverUri();
}
