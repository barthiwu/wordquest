import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useArcadePlaysStore } from '@/state/arcadePlaysStore';
import { ARCADE_GAME_TITLE_KEY } from '@/features/arcade/gameTitles';

const SHOW_MS = 6000;

/**
 * The "little notification" when a player passes 50 / 70 / 90 / 100 percent
 * of a game's daily plays. Mounted once in App.tsx so it shows over whichever
 * screen the play started from. The same milestone also goes out as a push /
 * inbox notification from the server.
 */
export function ArcadePlayNoticeToast() {
  const { t } = useTranslation('arcade');
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const notice = useArcadePlaysStore((s) => s.notice);
  const dismiss = useArcadePlaysStore((s) => s.dismissNotice);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(dismiss, SHOW_MS);
    return () => clearTimeout(id);
  }, [notice, dismiss]);

  if (!notice || !notice.percent) return null;
  const game = t(ARCADE_GAME_TITLE_KEY[notice.game].replace('arcade:', ''));
  const left = notice.remaining ?? 0;
  const text =
    notice.percent === 100
      ? t('plays.notice100', { game })
      : notice.percent === 50
        ? t('plays.notice50', { game, used: notice.used, limit: notice.limit })
        : t('plays.noticeMid', { game, percent: notice.percent, count: left });

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <Pressable
        style={styles.toast}
        onPress={dismiss}
        accessibilityRole="alert"
        accessibilityLabel={text}
      >
        <Ionicons
          name={notice.percent === 100 ? 'lock-closed-outline' : 'hourglass-outline'}
          size={20}
          color={colors.arcaneSoft}
        />
        <Text style={styles.text}>{text}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      alignItems: 'center',
      zIndex: 60,
      elevation: 10,
    },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      maxWidth: 520,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    text: { flexShrink: 1, color: colors.ink, fontSize: typography.scale.sm, fontWeight: '600' },
  });
}
