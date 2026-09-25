import { useMemo } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

/**
 * Screen 2 of the UI/UX Screen Bible. Registration/Login screens land with
 * the Auth module (build order §47 — Identity phase); this screen just
 * routes toward them so the navigation shell is exercised end to end.
 */
export function WelcomeScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('welcome');
  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Text style={styles.title}>{t('title')}</Text>
        <Text style={styles.subtitle}>{t('subtitle')}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => navigation.navigate('Registration')}
          accessibilityRole="button"
          accessibilityLabel={t('beginQuest')}
        >
          <Text style={styles.buttonPrimaryText}>{t('beginQuest')}</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          onPress={() => navigation.navigate('Login')}
          accessibilityRole="button"
          accessibilityLabel={t('haveAccount')}
        >
          <Text style={styles.buttonText}>{t('haveAccount')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xl,
      paddingTop: topInset + spacing.xxl * 2,
      paddingBottom: spacing.xxl,
    },
    copy: {
      gap: spacing.sm,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    subtitle: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
    },
    actions: {
      gap: spacing.sm,
    },
    button: {
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    buttonPrimary: {
      backgroundColor: colors.arcane,
    },
    buttonPrimaryText: {
      color: colors.ink,
      fontSize: typography.scale.md,
      fontWeight: '700',
    },
    buttonText: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
    },
  });
}
