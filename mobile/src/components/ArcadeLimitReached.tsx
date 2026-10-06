import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import type { ArcadeGameKind } from '@/services/arcadeStatus';
import { ARCADE_GAME_TITLE_KEY } from '@/features/arcade/gameTitles';
import { BackButton } from '@/components/BackButton';

interface Props {
  game: ArcadeGameKind;
  /** Where "Back to Arcade" goes. */
  onBack: () => void;
}

/**
 * Shown in place of a game when the server says today's plays of it are used
 * up (a deep link, or a start that raced the tile's own lock check).
 */
export function ArcadeLimitReached({ game, onBack }: Props) {
  const { t } = useTranslation('arcade');
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const name = t(ARCADE_GAME_TITLE_KEY[game].replace('arcade:', ''));

  return (
    <View style={styles.root}>
      <BackButton onPress={onBack} />
      <View style={styles.body}>
        <Ionicons name="lock-closed-outline" size={44} color={colors.arcaneSoft} />
        <Text style={styles.title}>{t('plays.lockedTitle', { game: name })}</Text>
        <Text style={styles.sub}>{t('plays.lockedBody', { game: name })}</Text>
        <Text style={styles.plus}>{t('plays.plusHint')}</Text>
        <Pressable
          style={styles.button}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('plays.backToArcade')}
        >
          <Text style={styles.buttonText}>{t('plays.backToArcade')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    body: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl,
      maxWidth: 520,
      width: '100%',
      alignSelf: 'center',
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: '800',
      textAlign: 'center',
    },
    sub: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
      textAlign: 'center',
      lineHeight: 22,
    },
    plus: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      fontWeight: '700',
      textAlign: 'center',
    },
    button: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
    },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  });
}
