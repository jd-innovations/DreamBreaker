import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { track } from './analytics';
import {
  navigateToExternalDestination,
  resolveNotificationDestination,
} from '@/lib/externalRouting';

export type PushRegistrationResult =
  | { ok: true; status: 'registered' | 'already_registered'; token: string }
  | { ok: false; status: 'not_supported' | 'permission_denied' | 'missing_project_id' | 'failed'; reason: string };

type RegisterOptions = {
  requestPermission?: boolean;
};

let lastHandledResponseKey: string | null = null;
let lastRegisteredUserId: string | null = null;
let lastRegisteredToken: string | null = null;

export function isNativePushSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function platformValue(): 'ios' | 'android' | 'unknown' {
  return Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown';
}

function getProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

function hasUsablePermission(status: Notifications.NotificationPermissionsStatus): boolean {
  if (status.granted || status.status === Notifications.PermissionStatus.GRANTED) return true;

  const iosStatus = status.ios?.status;
  return (
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

async function getGrantedPermission(requestPermission: boolean): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (hasUsablePermission(current)) return true;
  if (!requestPermission) return false;

  // The OS prompt is about to appear. shown/accepted/denied are separate events
  // because the gap between them is the number worth knowing: a low accept rate
  // is a copy problem, while never reaching `shown` is a code path problem.
  track('push_prompt_shown');
  const requested = await Notifications.requestPermissionsAsync();
  const granted = hasUsablePermission(requested);
  track(granted ? 'push_prompt_accepted' : 'push_prompt_denied', {
    permission_status: requested.status,
  });
  return granted;
}

async function getCurrentExpoPushToken(): Promise<string> {
  const projectId = getProjectId();
  if (!projectId) throw new Error('missing_project_id');

  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function getCurrentDeviceExpoPushToken(): Promise<string | null> {
  if (!isNativePushSupported() || !Device.isDevice) return null;
  const hasPermission = await getGrantedPermission(false);
  if (!hasPermission) return null;
  try {
    return await getCurrentExpoPushToken();
  } catch (err) {
    if (__DEV__) console.warn('[push] current token lookup failed', err);
    return null;
  }
}

/**
 * Whether push is actually on for THIS device and this user.
 *
 * The notifications screen used to initialise its Push toggle to `false` on
 * every mount and never ask. So the switch read OFF even when the device was
 * registered and notifications were arriving — it reported the state of a
 * `useState` call, not of the world. Reported from build #9 as "the toggle
 * switches back to inactive", alongside pushes that plainly worked.
 *
 * Both halves are required and they fail independently: permission can be
 * revoked in iOS Settings while the token row survives, and the row can be
 * deleted (sign-out cleanup, the receipt sweeper removing a dead token) while
 * permission is still granted. Either one means push does not reach this
 * device, so the toggle must show off.
 *
 * Never prompts — getCurrentDeviceExpoPushToken passes requestPermission:false.
 * Opening a settings screen is not consent to be asked for permission.
 */
export async function isPushRegisteredForThisDevice(userId: string): Promise<boolean> {
  const token = await getCurrentDeviceExpoPushToken();
  if (!token) return false;

  const { data, error } = await supabase
    .from('push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId)
    .eq('expo_push_token', token)
    .limit(1);

  if (error) {
    if (__DEV__) console.warn('[push] registration lookup failed', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function registerPushTokenForUser(
  userId: string,
  options: RegisterOptions = {},
): Promise<PushRegistrationResult> {
  if (!isNativePushSupported()) {
    return { ok: false, status: 'not_supported', reason: 'Push notifications are only supported on native platforms.' };
  }
  if (!Device.isDevice) {
    return { ok: false, status: 'not_supported', reason: 'Remote push notifications require a physical device.' };
  }

  try {
    const hasPermission = await getGrantedPermission(options.requestPermission ?? false);
    if (!hasPermission) {
      return { ok: false, status: 'permission_denied', reason: 'Notification permission was not granted.' };
    }

    const token = await getCurrentExpoPushToken();
    const alreadyRegistered = lastRegisteredUserId === userId && lastRegisteredToken === token;

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          expo_push_token: token,
          platform: platformValue(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,expo_push_token' },
      );

    if (error) throw error;

    lastRegisteredUserId = userId;
    lastRegisteredToken = token;
    if (__DEV__) console.log('[push] token registered', { platform: platformValue(), alreadyRegistered });

    return { ok: true, status: alreadyRegistered ? 'already_registered' : 'registered', token };
  } catch (err) {
    if (err instanceof Error && err.message === 'missing_project_id') {
      if (__DEV__) console.warn('[push] missing EAS projectId');
      return { ok: false, status: 'missing_project_id', reason: 'EAS projectId is missing from app config.' };
    }
    if (__DEV__) console.warn('[push] registration failed', err);
    return { ok: false, status: 'failed', reason: err instanceof Error ? err.message : 'Push registration failed.' };
  }
}

export async function deleteCurrentDevicePushToken(userId: string): Promise<void> {
  if (!isNativePushSupported() || !Device.isDevice) return;

  const token = await getCurrentDeviceExpoPushToken();
  if (!token) return;

  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('expo_push_token', token);

  if (error) throw error;
  if (lastRegisteredUserId === userId && lastRegisteredToken === token) {
    lastRegisteredUserId = null;
    lastRegisteredToken = null;
  }
  if (__DEV__) console.log('[push] current device token removed');
}

export function routeFromNotificationResponse(response: Notifications.NotificationResponse): void {
  const destination = resolveNotificationDestination(response.notification.request.content.data);
  if (!destination) {
    if (__DEV__) console.log('[push] notification response had no supported route');
    return;
  }

  const responseKey = `${response.notification.request.identifier}:${destination.href}`;
  if (lastHandledResponseKey === responseKey) return;
  lastHandledResponseKey = responseKey;

  if (__DEV__) console.log('[push] routing notification response', { destination });
  navigateToExternalDestination(destination);
}
