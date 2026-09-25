import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import type { MasteryLevel } from '@/services/users';

/**
 * The word-mastery card, extracted from WordMasteryScreen.tsx ("My
 * Words") so Home's Free Practice section (Sept 2026 homepage redesign)
 * can reuse the exact same card — word, mastery-level badge,
 * Guess/Sentence/Paragraph score chips, correct/presented meta, and the
 * improve/mastered footer line — instead of a second hand-copied version
 * that could drift from it. MASTERY_THRESHOLD/LEVEL_LABEL move here too,
 * as the one place both screens read them from.
 */

// Mirrors MasteryService's skillAreaMasteryThresholdPercent (backend
// config/gameplay-rules.ts) — a word only crosses MASTERED once every
// skill area clears this. Duplicated here (display-only) rather than
// shared, same as the rest of this component's data shape.
export const MASTERY_THRESHOLD = 75;

// Kept as the exported English fallback/type reference — other files
// (e.g. WordMasteryScreen.tsx) import this constant, so its shape and
// values are left untouched. This component itself renders translated
// text via LEVEL_LABEL_KEYS + t() below instead of reading this map
// directly, so the displayed badge is localized without changing what
// this export hands to other importers.
export const LEVEL_LABEL: Record<MasteryLevel, string> = {
  NEW: 'New',
  RECOGNIZING: 'Recognizing',
  RECALLING: 'Recalling',
  STRONG: 'Strong',
  MASTERED: 'Mastered',
};

const LEVEL_LABEL_KEYS: Record<MasteryLevel, string> = {
  NEW: 'wordMasteryCard.levelNew',
  RECOGNIZING: 'wordMasteryCard.levelRecognizing',
  RECALLING: 'wordMasteryCard.levelRecalling',
  STRONG: 'wordMasteryCard.levelStrong',
  MASTERED: 'wordMasteryCard.levelMastered',
};

export interface WordMasteryCardItem {
  word: string;
  currentLevel: MasteryLevel;
  guessScore: number;
  sentenceScore: number;
  paragraphScore: number;
  timesCorrect: number;
  timesPresented: number;
}

// Returns a translation KEY (under the 'common' namespace, matching the
// rest of this component) rather than English prose, so the "Improve: "
// sentence at the call site renders fully localized instead of pinning
// the skill name to English. Confirmed (Sept 2026 i18n pass) that
// nothing outside this file imports weakestSkill or reads .label
// directly, so changing this from prose to a key is safe.
const WEAKEST_SKILL_KEYS = {
  guess: 'common:wordMasteryCard.skillGuess',
  sentence: 'common:wordMasteryCard.skillSentence',
  paragraph: 'common:wordMasteryCard.skillParagraph',
} as const;

export function weakestSkill(item: WordMasteryCardItem): {
  labelKey: (typeof WEAKEST_SKILL_KEYS)[keyof typeof WEAKEST_SKILL_KEYS];
  score: number;
} | null {
  if (item.currentLevel === 'MASTERED') return null;
  const areas = [
    { labelKey: WEAKEST_SKILL_KEYS.guess, score: item.guessScore },
    { labelKey: WEAKEST_SKILL_KEYS.sentence, score: item.sentenceScore },
    { labelKey: WEAKEST_SKILL_KEYS.paragraph, score: item.paragraphScore },
  ];
  return areas.reduce((weakest, area) => (area.score < weakest.score ? area : weakest));
}

interface Props {
  item: WordMasteryCardItem;
  colors: ThemeColors;
  onPress: () => void;
}

export function WordMasteryCard({ item, colors, onPress }: Props) {
  const { t } = useTranslation('common');
  const styles = createStyles(colors);
  const mastered = item.currentLevel === 'MASTERED';
  const weakest = weakestSkill(item);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('wordMasteryCard.practiceLabel', { word: item.word })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardWord}>{item.word}</Text>
        <View style={[styles.levelBadge, mastered && styles.levelBadgeMastered]}>
          <Text style={[styles.levelBadgeText, mastered && styles.levelBadgeTextMastered]}>
            {t(LEVEL_LABEL_KEYS[item.currentLevel])}
          </Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        <ScoreChip label={t('wordMasteryCard.guess')} score={item.guessScore} styles={styles} />
        <ScoreChip
          label={t('wordMasteryCard.sentence')}
          score={item.sentenceScore}
          styles={styles}
        />
        <ScoreChip
          label={t('wordMasteryCard.paragraph')}
          score={item.paragraphScore}
          styles={styles}
        />
      </View>

      <Text style={styles.cardMeta}>
        {t('wordMasteryCard.correctMeta', {
          correct: item.timesCorrect,
          presented: item.timesPresented,
        })}
      </Text>

      {weakest && weakest.score < MASTERY_THRESHOLD ? (
        <Text style={styles.improveText}>
          {t('wordMasteryCard.improve', { skill: t(weakest.labelKey) })}
        </Text>
      ) : mastered ? (
        <Text style={styles.masteredText}>{t('wordMasteryCard.masteredText')}</Text>
      ) : null}
    </Pressable>
  );
}

function ScoreChip({
  label,
  score,
  styles,
}: {
  label: string;
  score: number;
  styles: ReturnType<typeof createStyles>;
}) {
  const cleared = score >= MASTERY_THRESHOLD;
  return (
    <View style={styles.scoreChip}>
      <Text style={styles.scoreChipLabel}>{label}</Text>
      <Text style={[styles.scoreChipValue, cleared && styles.scoreChipValueCleared]}>{score}%</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    cardPressed: {
      opacity: 0.7,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardWord: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    levelBadge: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    levelBadgeMastered: { backgroundColor: colors.glyph },
    levelBadgeText: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    levelBadgeTextMastered: { color: '#181233' },
    scoreRow: { flexDirection: 'row', gap: spacing.sm },
    scoreChip: { flex: 1, gap: 2 },
    scoreChipLabel: { color: colors.inkMuted, fontSize: typography.scale.xs },
    scoreChipValue: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    scoreChipValueCleared: { color: colors.success },
    cardMeta: { color: colors.inkMuted, fontSize: typography.scale.xs },
    improveText: { color: colors.warning, fontSize: typography.scale.xs, fontWeight: '700' },
    masteredText: { color: colors.glyph, fontSize: typography.scale.xs, fontWeight: '700' },
  });
}
