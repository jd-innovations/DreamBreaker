# PUSH_NOTIFICATIONS_PHASE1

Status: Code/config implemented; real-device completion still requires EAS/APNs verification.

## Files Changed

- `apps/mobile/package.json`
- `apps/mobile/package-lock.json`
- `apps/mobile/app.config.js`
- `apps/mobile/src/lib/pushNotifications.ts`
- `apps/mobile/src/hooks/usePushNotifications.ts`
- `apps/mobile/src/app/_layout.tsx`
- `apps/mobile/src/lib/auth.ts`
- `apps/mobile/src/app/onboarding/enable-notifications.tsx`
- `apps/mobile/src/app/notifications-settings.tsx`

## Native Configuration

- Added SDK-compatible `expo-notifications` using `npx expo install expo-notifications`.
- Added the built-in `expo-notifications` config plugin to the authoritative Expo config file: `apps/mobile/app.config.js`.
- No APNs keys, certificates, `.p8` files, or credentials were added to the repo.
- A new iOS EAS development build is required before this can run on a physical iPhone.

## Existing Infrastructure Reused

- Existing `public.push_tokens` table.
- Existing `public.notifications` in-app notification model.
- Existing `conversation_participant_settings` mute logic.
- Existing `notify_new_message()` database trigger.
- Existing `send-message-push` Edge Function.
- Existing message/conversation architecture.
- Existing `useUnreadCounts` remains the unread source of truth.
- Existing Expo Router conversation route: `/conversation/[id]`.

## Database Changes

None.

## Security Finding

The current baseline SQL source still contains a hard-coded bearer credential in the `notify_new_message()` implementation that calls `send-message-push`. I did not print, copy, rotate, or modify that credential.

Disposition: **NEEDS MANUAL SECURITY FOLLOW-UP**. Treat the exposed credential as requiring rotation and replace future source-controlled implementations with a safer server-side secret/config mechanism. Whether the currently deployed production trigger still uses that exact credential needs Supabase environment verification.

## EAS / APNs Status

Status: **needs manual verification**

The repo has an EAS development profile in `apps/mobile/eas.json`, but APNs/EAS credential state cannot be verified from source. Use EAS-managed credentials unless the project intentionally chooses another credential strategy.

Required build command:

```sh
cd apps/mobile
npx eas build --profile development --platform ios
```

After installing the new build on the iPhone, start Metro for the development client:

```sh
cd apps/mobile
npx expo start --dev-client
```

## Test Status

| Area | Status | Notes |
| ---- | ------ | ----- |
| Permission | NOT TESTED | Requires rebuilt dev client on physical iPhone. |
| Token generation | NOT TESTED | Uses `Notifications.getExpoPushTokenAsync({ projectId })`. |
| Token persistence | NOT TESTED | Client upserts to existing `push_tokens`; needs authenticated device test. |
| Direct Expo push | NOT TESTED | Use Expo push testing after token appears in DB. |
| Database-triggered message push | NOT TESTED | Existing trigger already sends `conversationId` and `messageId`. |
| Background delivery | NOT TESTED | Requires iPhone/APNs path. |
| Notification tap | NOT TESTED | Client routes `conversationId` to `/conversation/[id]`. |
| Cold-start routing | NOT TESTED | Uses `getLastNotificationResponseAsync`; requires native test. |
| Logout cleanup | NOT TESTED | `signOut()` deletes only the current device token before Supabase logout. |
| Re-login registration | NOT TESTED | Root lifecycle re-registers idempotently when a signed-in session exists and permission is already granted. |
| TypeScript | PASS | `npx tsc --noEmit` passed in `apps/mobile`. |
| Focused ESLint | PASS | Focused ESLint passed for changed mobile files. |
| EAS iOS development build | NOT TESTED | Manual build required. |

## Manual Developer Actions

1. Run the iOS EAS development build command above.
2. Install the resulting development client on User B's physical iPhone.
3. Verify EAS/APNs credentials when prompted by EAS.
4. Start Metro with `npx expo start --dev-client`.
5. Sign in as User B, enable push notifications, and confirm a token row appears in `public.push_tokens`.
6. Send a direct Expo push to that token before testing the database message trigger.
7. If direct Expo delivery succeeds, send a real message from User A to User B and verify delivery/tap routing.
8. Rotate/review the previously source-exposed bearer credential used by the SQL trigger.

## Phase 1 Implementation Notes

- Startup registration does not prompt. It only registers if permission is already granted.
- Explicit permission prompts are triggered from the existing onboarding/settings surfaces.
- Registration is idempotent and uses `upsert` with `onConflict: 'user_id,expo_push_token'`.
- Push notification receipt does not mutate unread counts; existing database state remains authoritative.
- Foreground notifications are allowed to show an alert, play sound, and appear in the notification list; native app icon badges remain disabled.
- Notification routing currently supports only message payloads containing `conversationId`.
- Logout cleanup attempts current-token deletion and then continues logout even if cleanup fails.

## Remaining Phase 2 Work

- Expo receipt polling and stale-token cleanup.
- Persisted notification preferences, categories, quiet hours, and badge counts.
- Additional notification domains such as bookings, tournaments, coach marketplace, wallet, and Partner Finder.
- Android push verification.
- Safer SQL trigger authentication mechanism after credential rotation/review.
