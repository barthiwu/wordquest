import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/app/providers/AppProviders';
import { RootNavigator } from '@/app/navigation/RootNavigator';
import { subscribeToNotificationTaps } from '@/utils/pushNotifications';

export default function App() {
  // Push deep linking (Correction & Completion Spec §6) — routes a
  // tapped notification through the same Linking/RootNavigator `linking`
  // config a tapped email link uses. Subscribed once for the app's
  // whole lifetime, same as the notification-permission/token setup
  // this pairs with.
  useEffect(() => subscribeToNotificationTaps(), []);

  return (
    <AppProviders>
      <StatusBar style="light" />
      <RootNavigator />
    </AppProviders>
  );
}
