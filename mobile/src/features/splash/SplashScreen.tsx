import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { syncPushToken } from '@/utils/pushNotifications';
import { AnimatedWordmark, WORDMARK_ANIMATION_DURATION_MS } from '@/components/AnimatedWordmark';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

/**
 * Screen 1 of the UI/UX Screen Bible. Now that the Auth module has
 * landed, this is where a stored session actually gets checked: hydrate()
 * loads whatever's in SecureStore, and a returning player with a valid
 * access token goes straight to Main instead of back through Welcome —
 * the store's hydrate() action already existed but nothing ever called
 * it, so every launch previously bounced a logged-in player back to
 * Welcome.
 *
 * The minimum splash time is tied to AnimatedWordmark's own animation
 * length rather than an arbitrary number — the vowel-drop *is* the
 * loading indicator now (no separate spinner), so the screen holds
 * exactly as long as that animation takes to settle, plus a short beat
 * to let the completed wordmark register before handing off.
 *
 * hydrate() is expected to be fast and local (SecureStore reads only,
 * no network), but nothing here previously guarded against it rejecting
 * or simply never settling — either one left the app stuck on this
 * screen forever with no way forward. SAFETY_TIMEOUT_MS below is a hard
 * backstop: whatever happens with hydrate(), navigation fires no later
 * than that, falling back to a logged-out state (Welcome), same as any
 * other hydrate failure.
 */
const HOLD_AFTER_ANIMATION_MS = 250;
const MIN_SPLASH_MS = WORDMARK_ANIMATION_DURATION_MS + HOLD_AFTER_ANIMATION_MS;
const SAFETY_TIMEOUT_MS = 8000;

export function SplashScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    let cancelled = false;

    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, MIN_SPLASH_MS));

    const hydrated = Promise.all([hydrate(), minDelay])
      .then(() => true as const)
      .catch((error: unknown) => {
        console.warn('SplashScreen: hydrate() failed, continuing as logged out', error);
        return true as const;
      });

    const safetyTimeout = new Promise<false>((resolve) => {
      setTimeout(() => resolve(false), SAFETY_TIMEOUT_MS);
    });

    Promise.race([hydrated, safetyTimeout]).then((settledInTime) => {
      if (cancelled) return;
      if (!settledInTime) {
        console.warn('SplashScreen: hydrate() did not settle in time, continuing as logged out');
      }
      const { accessToken } = useAuthStore.getState();
      if (accessToken) {
        syncPushToken(accessToken);
        navigation.replace('Main');
      } else {
        navigation.replace('Welcome');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigation, hydrate]);

  return (
    <View style={styles.container}>
      <AnimatedWordmark fontSize={52} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
