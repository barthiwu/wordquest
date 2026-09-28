import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import type { AliDisplayMessage } from '@/services/aliExpression';
import { AliMark } from './AliMark';
import { FadeInUp } from './FadeInUp';
import { RichAliText } from './RichAliText';

interface AliDeferredRecapProps {
  /** Reactions ALI logged mid-session instead of popping up live (the
   * flow's own `deferredAliReactions` field) — LEVEL_UP, JOURNEY_COMPLETION,
   * MASTERY_EVENT, ACHIEVEMENT_UNLOCK, and each flow's own result-type
   * events (BOSS_BATTLE_RESULT etc). Renders nothing for an empty array,
   * so callers can pass the field straight through with no length check. */
  reactions: AliDisplayMessage[];
  colors: ThemeColors;
  style?: StyleProp<ViewStyle>;
}

/**
 * "While you were playing…" recap card — the read-back half of Barth's
 * live/deferred split (task #99 follow-up): major progression events
 * that happen mid-session (arcade rounds, a Boss Battle match, a Master
 * Challenge attempt) never interrupt play with a live ALI pop-up: they're
 * fire-and-forget logged at the moment they happen, then surfaced here
 * once the session is over, on whichever results/leaderboard screen the
 * flow already shows.
 *
 * Shared across ScrambleQuest/Complete It's post-session ArcadeHeroResults
 * screen, Word Duel's match-complete state, Boss Battle's completed
 * leaderboard, and Master Challenge's results — same card everywhere so
 * the recap reads as one consistent ALI moment regardless of which flow
 * produced it. Place it as a sibling near the top or bottom of the
 * results content (not inside a ScrollView's fixed header) — it sizes to
 * its content and stacks fine either way.
 */
export function AliDeferredRecap({ reactions, colors, style }: AliDeferredRecapProps): ReactNode {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('common');

  if (reactions.length === 0) return null;

  return (
    <FadeInUp style={[styles.card, style]}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <AliMark size={14} />
        </View>
        <Text style={styles.title}>{t('aliDeferredRecap.title')}</Text>
      </View>
      {reactions.map((reaction, i) => (
        // reaction.text is ALI's own curated copy, same out-of-scope
        // rule as AliScreen/AliBubble -- left untranslated.
        <View key={i} style={i === 0 ? styles.firstLine : styles.line}>
          <RichAliText style={styles.text} text={reaction.text} />
        </View>
      ))}
    </FadeInUp>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      width: '100%',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.arcaneSoft,
      padding: spacing.md,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.arcaneSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    firstLine: { marginTop: spacing.sm },
    line: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    text: { color: colors.ink, fontSize: typography.scale.sm, lineHeight: 20 },
  });
}
