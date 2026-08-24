import { Linking, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { registerPushToken } from '@/services/notifications';

export interface DevicePushToken {
  token: string;
  platform: 'ios' | 'android';
}

/**
 * Acquires this device's Expo push token for the Notification Engine
 * (spec §15/§19). Deliberately "nice to have, never block the app on
 * it": a physical-device requirement, a denied permission, a simulator,
 * or a missing EAS project ID are all real, expected failure modes here
 * (same posture as utils/timezone.ts's getDeviceTimezone) — any of them
 * just means this device won't receive push, which every notification
 * path already handles (NotificationService.dispatchPushFireAndForget
 * simply does nothing when a player has zero registered tokens).
 */
export async function registerForPushNotificationsAsync(): Promise<DevicePushToken | null> {
  try {
    if (!Device.isDevice) return null; // push tokens aren't meaningful on a simulator/emulator
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data } = await Notifications.getExpoPushTokenAsync();
    return { token: data, platform: Platform.OS };
  } catch {
    return null;
  }
}

/**
 * Acquires this device's push token and registers it with the backend,
 * without awaiting or throwing — called from every place a session
 * becomes active (Splash after a successful hydrate, Login, Registration)
 * the same way every other fire-and-forget side effect in this app/the
 * backend it talks to is triggered. Re-registering on every session start
 * is intentional, not wasteful: registerPushToken upserts by token, and a
 * token can rotate at any time (Expo docs: reinstalls, OS-level resets),
 * so "register again" is the only way to keep the backend's record current.
 */
export function syncPushToken(accessToken: string): void {
  registerForPushNotificationsAsync()
    .then((device) => {
      if (!device) return;
      return registerPushToken(accessToken, device.token, device.platform);
    })
    .catch(() => {
      // Best-effort — a failure here must never disrupt login/onboarding/app-start.
    });
}

/**
 * Push deep linking (Correction & Completion Spec §6) — the mobile half
 * of NotificationService merging `deepLink` into the Expo push payload's
 * `data` field. Routes a tapped notification the exact same way a
 * tapped email link is routed: through `Linking.openURL`, which fires
 * the same 'url' event React Navigation's `linking` config (see
 * app/navigation/linking.ts) already subscribes to — so there is no
 * separate navigation path to keep in sync with the URL-routing table,
 * only the one.
 *
 * Registers both of expo-notifications' delivery paths for a tap:
 * `getLastNotificationResponseAsync` for a notification that launched
 * the app from a cold start (the response listener alone misses this —
 * it only fires for a tap that happens while JS is already running),
 * and `addNotificationResponseReceivedListener` for every tap after
 * that. Returns an unsubscribe function for the caller's effect cleanup.
 */
export function subscribeToNotificationTaps(): () => void {
  const openDeepLink = (response: Notifications.NotificationResponse | null): void => {
    const deepLink = response?.notification.request.content.data?.deepLink;
    if (typeof deepLink === 'string' && deepLink.length > 0) {
      Linking.openURL(deepLink).catch(() => {
        // Best-effort — a malformed or unroutable deep link must never crash the app.
      });
    }
  };

  Notifications.getLastNotificationResponseAsync()
    .then(openDeepLink)
    .catch(() => {
      // Best-effort — see above.
    });

  const subscription = Notifications.addNotificationResponseReceivedListener(openDeepLink);
  return () => subscription.remove();
}
