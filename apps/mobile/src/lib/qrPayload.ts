import { APP_LINK_DOMAIN } from '@/lib/appLinks';
import { resolveExternalUrl, type ExternalDestination } from '@/lib/externalRouting';

// A fixed, non-guessable-but-non-secret sentinel used only to prove the
// scanner pipeline (permission -> camera -> QR decode -> classify -> success
// UI) end-to-end on a physical device before any business action is wired
// up. Carries no privilege and triggers no server call.
export const QR_DEV_TEST_PAYLOAD = 'pickleballapp:dev-scan-test-v1';

// Reserved path prefix for opaque, server-resolved redemption/check-in
// tokens (`https://pickleballapp.app/q/<token>`). Deliberately NOT routed
// through the Phase 4 general deep-link resolver: a scan token needs its own
// server-side validation (expiry, actor authorization, single-use) that
// general navigation destinations don't, per Phase 5 Step 10/19. Phase 5
// only recognizes the shape; no domain resolves it yet (see
// QR_CAMERA_PHASE5.md "Existing QR Domains Audited").
const SCAN_TOKEN_PATH_PREFIX = '/q/';

// Canonical constructor for the reserved scan-token shape, so any screen
// that needs to *display* a scan-token QR (e.g. a player's tournament
// check-in credential) builds it the same way this module parses it,
// rather than hand-assembling the URL in multiple places.
export function buildScanTokenUrl(token: string): string {
  return `https://${APP_LINK_DOMAIN}${SCAN_TOKEN_PATH_PREFIX}${encodeURIComponent(token)}`;
}

export type QrClassification =
  // Matches QR_DEV_TEST_PAYLOAD exactly. No mutation, no network call.
  | { kind: 'dev_test' }
  // A canonical https://pickleballapp.app/... URL that the existing Phase 4
  // resolver (externalRouting.ts) already knows how to route (conversation,
  // group, tournament, marketplace, etc). Reuses that resolver rather than
  // re-implementing route matching here.
  | { kind: 'app_link'; destination: ExternalDestination }
  // A syntactically valid https://pickleballapp.app/q/<token> scan token.
  // The token is treated purely as an opaque identifier -- classification
  // here says nothing about whether it's valid, expired, or redeemable;
  // only a server-authoritative check can say that, and none exists yet.
  | { kind: 'scan_token'; token: string }
  // Anything else: malformed text, a non-pickleballapp URL, a non-https
  // scheme, or a URL shape this app doesn't recognize. Never triggers
  // navigation or a privileged action.
  | { kind: 'unsupported' };

export function classifyQrPayload(raw: string): QrClassification {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'unsupported' };

  if (trimmed === QR_DEV_TEST_PAYLOAD) return { kind: 'dev_test' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { kind: 'unsupported' };
  }

  // QR is untrusted external input (Step 19) -- restrict to the app's own
  // canonical https domain. Unlike Universal Link inbound handling, a
  // scanned code never gets the legacy custom-scheme path;
  // that path exists for the OS's own link-opening flow, not for handing
  // arbitrary scanned strings straight into it.
  if (url.protocol !== 'https:') return { kind: 'unsupported' };
  if (url.hostname !== APP_LINK_DOMAIN && url.hostname !== `www.${APP_LINK_DOMAIN}`) {
    return { kind: 'unsupported' };
  }

  if (url.pathname.startsWith(SCAN_TOKEN_PATH_PREFIX)) {
    const token = url.pathname.slice(SCAN_TOKEN_PATH_PREFIX.length).split('/')[0];
    return token ? { kind: 'scan_token', token: decodeURIComponent(token) } : { kind: 'unsupported' };
  }

  const destination = resolveExternalUrl(trimmed);
  return destination ? { kind: 'app_link', destination } : { kind: 'unsupported' };
}
