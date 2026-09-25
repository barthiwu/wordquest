import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';

/**
 * Every screen in the stack renders with `headerShown: false` (see
 * RootNavigator) so the app can fully own its header styling later —
 * this fills the gap for any screen reached by pushing forward rather
 * than replacing, which therefore needs a way back.
 */
export function BackButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('common');
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('back')}
      accessibilityHint={t('backHint')}
      style={styles.button}
      hitSlop={8}
    >
      <Text style={styles.text}>‹ {t('back')}</Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
    text: { color: colors.arcaneSoft, fontSize: typography.scale.md, fontWeight: '700' },
  });
}
