import type { ImageSourcePropType } from 'react-native';

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
export const DEFAULT_EVENT_COVER: ImageSourcePropType = DEFAULT_EVENT_COVER_ASSET;

// Previously this module also exported `eventCoverUri` / `defaultEventCoverUri`,
// which converted the bundled asset to a URI string via `Asset.fromModule(...)
// .uri` so it could be handed to `<Image source={{ uri }} />` as a plain
// string. That conversion does not reliably resolve to a loadable URI in an
// installed build — it works in dev because Metro serves bundled assets over
// http://, which does not hold once the app is actually installed. The
// function's own `catch` swallowed the failure and cached `''` for the rest of
// the session, so the default silently stopped rendering for every event, with
// no error anywhere. Confirmed via storage timestamps: cover-less events had
// no visible fallback going back to at least 2026-08-21.
//
// `facilityCover.ts` never had this bug because it never converts to a URI —
// it hands the `require(...)` module source straight to `<Image source={...}
// />`. `eventCoverSource` does the same. The return type is `ImageSourcePropType`
// rather than `string` on purpose: a same-shaped return makes it obvious at
// every call site that this is a source object, not a URI, so it cannot be
// quietly narrowed back to a string-only API later and reintroduce the bug.

/** The organizer's cover when present, otherwise the bundled court default. */
export function eventCoverSource(coverUrl?: string | null): ImageSourcePropType {
  return coverUrl && coverUrl.length > 0 ? { uri: coverUrl } : DEFAULT_EVENT_COVER;
}
