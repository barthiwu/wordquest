import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useTipsStore } from '@/state/tipsStore';

interface FirstTimeTipProps {
  /** Stable, unique id for this tip (e.g. "play.intro") -- persisted in
   * tipsStore, so changing it re-shows the tip to everyone who already
   * dismissed the old one. Keep it stable once shipped. */
  id: string;
  colors: ThemeColors;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A dismissible, one-time explainer callout for a specific screen's
 * mechanics -- the "here's how this actually works" counterpart to
 * AppIntroScreen's one-time "what is this app" orientation at signup
 * (see that screen's doc comment). Renders nothing once tipsStore has
 * this id recorded as seen, and nothing before tipsStore finishes
 * hydrating (never flashes, then disappears, on a screen a returning
 * player has already dismissed it on).
 *
 * Title and body are supplied by the caller (screen-specific copy,
 * already translated under that screen's own namespace); only the
 * dismiss button's label is owned here, under common.firstTimeTip.
 */
export function FirstTimeTip({ id, colors, icon, title, body, style }: FirstTimeTipProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('common');
  const isHydrated = useTipsStore((s) => s.isHydrated);
  const hasSeen = useTipsStore((s) => s.seen.has(id));
  const markSeen = useTipsStore((s) => s.markSeen);

  if (!isHydrated || hasSeen) return null;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={colors.glyph} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <Pressable
        style={styles.dismiss}
        onPress={() => markSeen(id)}
        accessibilityRole="button"
        accessibilityLabel={t('firstTimeTip.dismiss')}
      >
        <Ionicons name="close" size={16} color={colors.inkMuted} />
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textCol: { flex: 1, gap: 2 },
    title: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    body: { color: colors.inkMuted, fontSize: typography.scale.sm, lineHeight: 19 },
    dismiss: { padding: spacing.xs },
  });
}
