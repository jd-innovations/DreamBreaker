import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import {
  isNativePushSupported,
  registerPushTokenForUser,
  routeFromNotificationResponse,
} from '@/lib/pushNotifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications(userId: string | null) {
  useEffect(() => {
    if (!userId || !isNativePushSupported()) return;

    let cancelled = false;
    registerPushTokenForUser(userId, { requestPermission: false }).then((result) => {
      if (!cancelled && __DEV__) {
        console.log('[push] startup registration check', { status: result.status, ok: result.ok });
      }
    });

    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!isNativePushSupported()) return;

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      if (__DEV__) {
        console.log('[push] notification received', {
          id: notification.request.identifier,
          data: notification.request.content.data,
        });
      }
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (__DEV__) {
        console.log('[push] notification response received', {
          id: response.notification.request.identifier,
          data: response.notification.request.content.data,
        });
      }
      routeFromNotificationResponse(response);
    });

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) routeFromNotificationResponse(response);
      })
      .catch((err) => {
        if (__DEV__) console.warn('[push] initial notification response lookup failed', err);
      });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);
}
