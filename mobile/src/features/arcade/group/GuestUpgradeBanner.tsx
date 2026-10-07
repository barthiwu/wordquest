import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

/** Shown to guests only: keep the name and the games by creating a free account. */
export function GuestUpgradeBanner({ groupCode }: { groupCode?: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('arcade');
  const isGuest = useAuthStore((s) => s.user?.isGuest === true);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  if (!isGuest) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('group.guest.upgradeTitle')}</Text>
      <Text style={styles.body}>{t('group.guest.upgradeBody')}</Text>
      <Pressable
        style={styles.button}
        onPress={() => navigation.navigate('Registration', { upgrade: true, groupCode })}
        accessibilityRole="button"
        accessibilityLabel={t('group.guest.upgradeCta')}
      >
        <Text style={styles.buttonText}>{t('group.guest.upgradeCta')}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      width: '100%',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderColor: colors.arcane,
      borderWidth: 1.5,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    title: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '800' },
    body: { color: colors.inkMuted, fontSize: typography.scale.sm, lineHeight: 20 },
    button: {
      alignSelf: 'flex-start',
      backgroundColor: colors.arcane,
      borderRadius: radius.lg,
      paddingVertical: 12,
      paddingHorizontal: 20,
      minHeight: 44,
      justifyContent: 'center',
    },
    buttonText: { color: '#fff', fontSize: typography.scale.sm, fontWeight: '800' },
  });
}
