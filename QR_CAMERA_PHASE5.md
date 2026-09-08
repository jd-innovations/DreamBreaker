# QR_CAMERA_PHASE5.md

> Status: **COMPLETE.** Scanner foundation implemented, verified by compiler/linter, and physically validated on a real iPhone via a new EAS iOS development build. No business-domain redemption/check-in flow was wired — that remains deliberately out of scope for the foundation phase.
> Module: Native Capabilities Phase 5 — QR Camera / Scanner Foundation
> Date: 2026-08-13 (implementation) / 2026-08-14 (EAS build + physical-device validation)

## Files Changed

- `apps/mobile/package.json` — added `expo-camera`.
- `apps/mobile/package-lock.json` — lockfile update from the install.
- `apps/mobile/app.config.js` — added the `expo-camera` plugin entry; introduced a single shared `CAMERA_PERMISSION_TEXT` constant used by both `expo-image-picker` and `expo-camera`'s plugin config (see Native Configuration below for why).
- `apps/mobile/src/app/_layout.tsx` — registered the `dev-qr-scan` route (same pattern as the existing `design-lab` dev screen).
- `apps/mobile/src/app/dev-qr-scan.tsx` — new. The Step 11 development QR test screen.
- `apps/mobile/src/components/QRScanner.tsx` — new. Type-resolution re-export (Metro platform-extension pattern, mirrors `ExploreMap.tsx`).
- `apps/mobile/src/components/QRScanner.native.tsx` — new. The real scanner implementation (iOS/Android).
- `apps/mobile/src/components/QRScanner.web.tsx` — new. Web fallback, imports no native camera module.
- `apps/mobile/src/components/QRScanner.types.ts` — new. Shared prop/handle types.
- `apps/mobile/src/components/index.ts` — exported `QRScanner` and its types.
- `apps/mobile/src/lib/qrPayload.ts` — new. QR payload classifier (dev-test / app-link / scan-token / unsupported).

No other files were touched. Existing `expo-image-picker` flows, push notification routing, Universal Link resolver, and all business-domain screens (tournament, booking, wallet) were not modified beyond the one shared permission-text constant described below.

## Native Dependency

- Installed via `npx expo install expo-camera` (SDK-resolved, not hand-pinned).
- Installed version: **`expo-camera@~17.0.10`**, resolved as compatible with the project's **Expo SDK 54.0.0** (per `apps/mobile/package.json`'s `"expo": "~54.0.0"`). The install ran in offline mode (no network reachable for the live compatibility check) and fell back to Expo's local `bundledNativeModules.json` map, which is the same source `expo install` uses for version resolution when online — the resolved version is not a guess.

## Native Configuration

- Added the `expo-camera` plugin to `apps/mobile/app.config.js`'s `plugins` array, alongside the existing `expo-image-picker` entry.
- **Discrepancy found and resolved before proceeding, as instructed by Step 1/2:** iOS exposes exactly one `NSCameraUsageDescription` string for the whole app. `expo-image-picker` was already setting it (chat-photo-specific copy). Reading `@expo/config-plugins`' iOS permissions helper (`node_modules/@expo/config-plugins/build/ios/Permissions.js`) confirmed that whichever plugin supplies a non-empty `cameraPermission` string last in the `plugins` array wins outright — there is no merge, and the actual dialog text a user sees would otherwise depend on undocumented plugin ordering rather than intent. Fixed by introducing one `CAMERA_PERMISSION_TEXT` constant near the top of `app.config.js` and passing the identical string to both `expo-image-picker`'s and `expo-camera`'s `cameraPermission` option, so the compiled `Info.plist` value is correct and order-independent:
  > "Allow DreamBreaker to use your camera to take and send photos in chat, and to scan QR codes for check-in and redemption."
  Product naming follows the existing convention in this exact file ("DreamBreaker uses your location...", "Allow DreamBreaker to access your photos...") rather than "Pickleball App" — the task's example copy was conceptual, and the instruction to use naming consistent with the app takes precedence.
- `expo-camera`'s plugin also requests microphone access by default (for video recording). QR scanning needs no audio, so this was explicitly suppressed: `microphonePermission: false` (deletes the `NSMicrophoneUsageDescription` Info.plist key rather than adding a generic one) and `recordAudioAndroid: false` (skips adding `RECORD_AUDIO` on Android). This keeps the permission footprint to exactly what QR scanning needs.
- Barcode-type restriction (QR-only) is **not** a build-time plugin option — it's the runtime `CameraView` prop `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`, set in `QRScanner.native.tsx`.
- Existing plugins (`expo-notifications`, `@stripe/stripe-react-native`, Associated Domains, Google Maps keys, etc.) were left untouched.

## EAS Build

**PASS.** A new iOS development build containing `expo-camera` was built via:

```sh
cd apps/mobile
eas build --profile development --platform ios
```

Two earlier attempts failed at the `Install dependencies` phase (`npm ci` rejecting an out-of-sync `package-lock.json` — see git history: "Regenerate package-lock.json to fix EAS build failure" and "Fully regenerate package-lock.json to fix EAS install failure"). Root cause was diagnosed from the actual EAS build logs (fetched via `eas build:view <id> --json`'s signed `logFiles` URL, brotli-decompressed) rather than guessed: an optional/peer devDependency subtree (`eslint-import-resolver-typescript` → `unrs-resolver` → `@unrs/resolver-binding-wasm32-wasi` → `@emnapi/*`) resolved to different versions across npm runs. A full `node_modules` + lockfile regeneration produced a deterministic lockfile, and the subsequent build succeeded and installed on the test device. This was a build-pipeline/dependency fix only — no application code changed.

## Scanner Architecture

One reusable component, `QRScanner` (`apps/mobile/src/components/QRScanner.native.tsx`, web-stubbed via the established `ExploreMap`-style `.native`/`.web` platform split), owns:

- Camera permission state (`useCameraPermissions`) with three UX states: not-determined (app-owned explanation + "Allow Camera"), denied (explanation + "Open Settings", or "Allow Camera" again only when `canAskAgain` — iOS never re-prompts natively once denied, so this never loops the native dialog), and granted (camera renders).
- `CameraView` configured `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}` — QR only, per Step 5.
- A scan lock implemented as a `useRef` boolean, not React state — the barcode callback can fire multiple times per render while the same code stays in frame, and a ref blocks every call after the first synchronously, where state-based locking would race. Exposed to the caller via `useImperativeHandle` as `resume()`, called only when the user taps "Scan Again".
- Close and flashlight (`enableTorch`) controls, both with `accessibilityRole`/`accessibilityLabel`.
- A full-screen dark overlay with a centered square frame, built from plain flexbox `View`s (no masking library, no animation) — the frame color and CTA use existing gold/navy theme tokens (`@/theme`).

The component takes a single `onScanned(raw: string)` callback and does **no classification or business logic itself** — it hands the raw decoded string to the caller. Classification lives in `apps/mobile/src/lib/qrPayload.ts`, kept separate specifically so no business-domain trust decisions live inside the generic camera component (Step 4's explicit instruction).

The Step 11 development test screen, `apps/mobile/src/app/dev-qr-scan.tsx`, composes `QRScanner` + `classifyQrPayload` + the centralized `haptics` utility + a success/info/error result screen with "Scan Again"/"Close". It is not linked from product navigation (reached directly, like `design-lab`), matching the existing pattern for dev-only proof screens in this repo.

## QR Payload Strategy

`classifyQrPayload(raw: string)` in `apps/mobile/src/lib/qrPayload.ts` returns one of four kinds — no live tokens are logged or exposed anywhere in this report:

1. **`dev_test`** — the raw text exactly matches a fixed sentinel (`pickleballapp:dev-scan-test-v1`). Carries no privilege, triggers no network call. Exists solely to prove the pipeline end-to-end before any real payload exists.
2. **`app_link`** — a syntactically valid `https://pickleballapp.app/...` (or `www.` variant) URL that the **existing Phase 4 resolver** (`resolveExternalUrl` in `externalRouting.ts`) already knows how to route. Reused rather than reimplemented, per Step 10.
3. **`scan_token`** — a syntactically valid `https://pickleballapp.app/q/<token>` URL. This shape is reserved for opaque, server-resolved redemption/check-in identifiers and is **deliberately not routed through the general deep-link resolver** — Step 10 explicitly warns against forcing a secure redemption token through general navigation, since it needs its own server-side validation (expiry, single-use, actor authorization) that a navigation destination doesn't. Phase 5 only recognizes this shape exists; nothing resolves it yet, because no such server endpoint exists (see next section).
4. **`unsupported`** — anything else: malformed text, a non-`https` scheme, a URL on any domain other than `pickleballapp.app`, or a shape the resolver doesn't recognize. Never triggers navigation or a privileged action. Notably, QR input is **not** given access to the legacy `dreambreaker://` custom-scheme path even though inbound Universal Links are — that path exists for the OS's own link-opening flow, not for handing arbitrary scanned strings straight into a custom-scheme handler.

The QR is always treated as an identifier to classify, never as proof of anything. No plans exist to encode payment status, entitlement counts, role, or reservation/redemption status directly in a QR payload.

## Existing QR Domains Audited

| Domain | Status | Reasoning |
| ------ | ------ | --------- |
| **Tournament check-in** | **READY** | `checkInPlayer()` (`apps/mobile/src/lib/supabase/registrations.ts:257`) is a direct client `UPDATE` on `registrations`, but it is genuinely server-authoritative: RLS policy `"registrations: director update own tournament"` (`supabase/migrations/20260725000000_baseline_from_prod.sql:7489`) requires `auth.uid() = tournaments.director_id` **and** `is_approved_director()`. The separate `"registrations: player update own"` policy's `WITH CHECK` does not permit a player to set `status='checked_in'` on their own row — so even a compromised or modified client cannot self-check-in via this path. A director-facing manual check-in screen (`apps/mobile/src/app/tournament/[id]/check-in.tsx`) already calls this exact function today. |
| **Court booking check-in** | **NOT READY** | Audited `apps/mobile/src/lib/supabase/reservations.ts` in full: there is no check-in field, status value, RPC, or concept anywhere in the reservation schema or client wrapper. Building this would mean inventing new check-in rules and possibly new RLS from scratch in Phase 5, which Step 13 explicitly says not to do ("Do not invent check-in rules in Phase 5. If server validation is incomplete, document and defer."). Documented and deferred. |
| **Coach voucher redemption** | **PARTIAL** | The schema is deliberately pre-built for this: `supabase/migrations/20260810020000_coach_marketplace_phase4_wallet_vouchers.sql` creates `coach_voucher_entitlements` and its own comment (line 91) calls it "the authoritative redemption-entitlement record consumed by Phase 5 QR/manual redemption" — a prior phase anticipated this work. It has an integrity trigger (`fn_protect_coach_voucher_entitlement_integrity`) that blocks any client write to `remaining_redemptions`/`total_redemptions`, and RLS grants buyers/coaches read-only access with no UPDATE policy at all — so redemption can *only* happen through a privileged (`SECURITY DEFINER`) server function. Searched every migration for a redemption RPC (`redeem_coach_voucher`, `FUNCTION.*redeem`, `redemption_code`, `redemption_token`) — **none exists yet**. The client wrapper (`apps/mobile/src/lib/supabase/wallet.ts`) only reads (`fetchCoachVoucherEntitlementSummary`); its own comment says "Phase 5 redemption will change these counts." Building that RPC now would mean writing new privileged financial-entitlement logic inside a scanner-foundation phase, which Step 13 also cautions against ("Do not decrement entitlements from the client" / "This domain likely requires stronger server-authoritative redemption logic"). Groundwork is ready; execution path is not. |

## Recommended First Real Integration

**Tournament check-in.** It's the only domain where server-side authorization already fully exists and is already exercised in production today by the manual check-in screen — adding a QR path means resolving a scanned identifier to a `registrations.id` and calling the *exact same* `checkInPlayer()` used by the existing "Check In" button, under the *exact same* RLS gate. No new RPC, no new RLS policy, no new entitlement-tracking logic. It also satisfies every criterion in Step 14: strongest existing backend validation, smallest safe change, clear actor authorization (director-only, enforced server-side), and straightforward physical-device testing (a director scans a player's registration identifier at event check-in).

This was **not implemented** in this pass — per Step 14/the acceptance criteria, a real domain-specific flow is not required to close the scanner foundation, and wiring it would also require a QR *generation* surface (something that shows each player's registration as a scannable code), which is outside everything this phase asked for (scanning only). That's the concrete next step if this integration is picked up: decide how the registration identifier gets onto a scannable code (e.g., the player's own device rendering a QR of their registration id, or a director-facing roster), then route the scanned value through `classifyQrPayload`'s `scan_token` shape (or a new narrower classification) into `checkInPlayer()`.

## Physical iPhone Tests

**PASS — all six.** Run by the device owner on a physical iPhone against the new EAS development build, via the `dev-qr-scan` screen and the two test QR codes (dev-test-payload success case, unrelated-URL error case). These results are the device owner's report of what they observed on their own hardware, not something this session independently instrumented or watched directly — noted here the same way the Phase 4 report attributed its one physical-device confirmation.

| Test | Status |
| ---- | ------ |
| Camera permission (not-determined → grant → scanner opens) | **PASS** |
| Permission denied (safe state, no crash, app remains usable) | **PASS** |
| Valid QR (scans, callback runs once, success state) | **PASS** |
| Duplicate scan (same code held in view, action executes once) | **PASS** |
| Unsupported QR (safe error state, no arbitrary action) | **PASS** |
| Scan Again (scanner resets cleanly) | **PASS** |

Confirmed on-device:

1. Camera permission can be granted from the app-owned explanation screen, and the scanner opens correctly afterward.
2. A denied camera permission produces the intended safe state (no crash, app remains usable, "Open Settings" path available) rather than a broken or blank screen.
3. The valid development QR (`pickleballapp:dev-scan-test-v1`) is successfully recognized and shows the gold "QR Recognized" success state.
4. The scan lock holds — keeping the same QR code in frame does not repeatedly re-fire the scan callback or the success state.
5. Unsupported QR content (an unrelated URL, not on the `pickleballapp.app` domain) is rejected safely: red "Unsupported QR" state, no navigation, no privileged action of any kind.
6. "Scan Again" resets the scanner cleanly and allows a subsequent scan to be recognized.
7. The new EAS development build containing `expo-camera` runs correctly on the physical iPhone — the native module loads and the camera preview renders, which Metro/Fast Refresh on the old dev client could never have exercised.

What was also verified independently this pass (not device-dependent): `npx tsc --noEmit` clean in both `apps/mobile` and `web`; `npx eslint` clean (0 errors, 0 warnings) on every new/changed file (`QRScanner.*`, `qrPayload.ts`, `dev-qr-scan.tsx`, `_layout.tsx`, `app.config.js`, `components/index.ts`).

**Still not tested, and not claimed here:** any domain-specific QR business flow (tournament check-in, booking check-in, coach voucher redemption). Only the generic scanner foundation — permission handling, camera rendering, QR decode, classification, scan-lock, success/error UI — has been physically validated. No check-in or redemption action has been scanned, wired, or exercised on a device.

## Database Changes

**None.** No migration was written or applied. This matches the acceptance criteria's expectation for a scanner foundation with no business action wired up.

## Security Findings

- No new client-side trust was introduced. The scanner classifies a QR's *shape* only; it never executes a business action, and the one domain identified as ready (tournament check-in) would, if wired up later, still go through the same director-gated RLS policy that already governs manual check-in today.
- The reserved `/q/<token>` scan-token shape is recognized but intentionally inert in this phase — no endpoint resolves it, so there is nothing to redeem or misuse yet.
- No camera frames are captured to disk, uploaded, or logged. `CameraView` is used purely for live barcode detection (`onBarcodeScanned`); no `takePictureAsync`/`recordAsync` calls exist anywhere in the new code.
- The dev-test payload (`pickleballapp:dev-scan-test-v1`) is a fixed, non-secret sentinel with zero privilege — safe to leave in source and to print in logs/reports.
- Carried over from `PUSH_NOTIFICATIONS_PHASE1.md` and unrelated to this phase: the previously-flagged hard-coded bearer credential in `notify_new_message()` is still marked "NEEDS MANUAL SECURITY FOLLOW-UP" and was not touched here.

## Phase 5 Definition of Done

Met: a physical iPhone opens the pickleballapp scanner, scans a valid QR exactly once, safely identifies/handles the payload, provides clear success/error feedback, and does not trust the QR to perform privileged business actions without server validation. Specifically:

- `expo-camera` installed/configured correctly — confirmed by `tsc`/`eslint` and by the EAS build succeeding with it bundled.
- New EAS iOS development build succeeded — **PASS**.
- Physical iPhone camera permission flow works (both granted and denied paths) — **PASS**.
- QR camera renders on-device — **PASS**.
- QR codes scan successfully — **PASS**.
- Duplicate scans are prevented (scan lock) — **PASS**.
- Unsupported/malformed QR input fails safely, no unintended navigation/action — **PASS**.
- Success/error states are visible — **PASS**.
- Centralized haptics (`haptics.success()` / `haptics.error()`) are reused, not raw `expo-haptics` — unchanged from implementation, confirmed by code (not modified this pass).
- Existing `expo-image-picker`/photo flows unaffected — unchanged, not touched this pass.
- No privileged client-side trust introduced, no duplicate business systems created — unchanged, confirmed by the domain audit above (all three business domains remain unimplemented in the scanner).
- TypeScript/lint checks pass — confirmed both at implementation time and unaffected by this pass (no code changed).

Per the phase's own acceptance criteria, a real domain-specific redemption/check-in flow was correctly **not** required to close this out, and none was built. Phase 5 Scanner Foundation is COMPLETE on that basis. Phase 5.1 (a real domain integration, most likely tournament check-in per the recommendation above) has not been started.

## Deferred Work

- Wiring tournament check-in as the first real QR business flow (requires deciding on a QR-generation surface for registration identifiers — out of scope for a scanner-only phase).
- A redemption RPC for coach vouchers, once product/security explicitly signs off on the server-authoritative redemption logic the existing schema comments say Phase 5 was reserved for.
- Booking/reservation check-in rules — no schema exists yet; needs its own design pass before any QR work there.
- Expo receipt/invalid-token-style cleanup concerns don't apply here (no tokens are issued by this phase), but if `/q/<token>` redemption is built later, its expiry/single-use/revocation handling will need the same rigor called out in Step 19.
