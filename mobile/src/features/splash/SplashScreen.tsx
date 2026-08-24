import { useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuthStore } from '@/state/authStore';
import { syncPushToken } from '@/utils/pushNotifications';
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
 * Welcome. A brief minimum splash time is kept even though hydrate()
 * itself is fast, so the wordmark doesn't just flash.
 */
export function SplashScreen({ navigation }: Props) {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    let cancelled = false;
    const minDelay = new Promise((resolve) => setTimeout(resolve, 900));

    Promise.all([hydrate(), minDelay]).then(() => {
      if (cancelled) return;
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
      <Text style={styles.wordmark}>WordQuest</Text>
      <ActivityIndicator color={colors.arcaneSoft} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  wordmark: {
    color: colors.ink,
    fontSize: typography.scale.xxl,
    fontWeight: typography.display.weight,
    letterSpacing: 1,
  },
  spinner: {
    marginTop: spacing.md,
  },
});
