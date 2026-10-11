import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';

export interface AnswerReviewProps {
  colors: ThemeColors;
  /** Exactly what the player wrote (typed answer, or the letters they tried in Hangman). */
  submitted: string;
  /** The right answer. */
  correct: string;
  isCorrect: boolean;
  /** Hangman: `submitted` is a list of letters, not a typed word. */
  letters?: boolean;
  /** The clock ran out. */
  timedOut?: boolean;
}

/**
 * Shows the player what they actually wrote after every word, in every
 * game, so nobody is left arguing with the app about whether they got it:
 * a right answer gets a green check in front of it; a wrong one gets a red
 * cross in front of it, then the real answer after it. The text is the
 * server's own echo of the submission, not something the app remembers.
 */
export function AnswerReview({
  colors,
  submitted,
  correct,
  isCorrect,
  letters = false,
  timedOut = false,
}: AnswerReviewProps) {
  const { t } = useTranslation('arcade');
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tint = isCorrect ? colors.success : colors.danger;
  const shown = letters
    ? submitted
        .split('')
        .map((l) => l.toUpperCase())
        .join(' ')
    : submitted;

  return (
    <View
      style={[styles.card, { borderColor: tint }]}
      accessible
      accessibilityLabel={
        isCorrect
          ? t('answerReview.a11yCorrect', { answer: shown })
          : t('answerReview.a11yWrong', { answer: shown || t('answerReview.noAnswer'), correct })
      }
    >
      <View style={styles.row}>
        <Ionicons name={isCorrect ? 'checkmark-circle' : 'close-circle'} size={22} color={tint} />
        <View style={styles.flex}>
          <Text style={styles.label}>
            {letters ? t('answerReview.yourLetters') : t('answerReview.yourAnswer')}
          </Text>
          <Text style={[styles.answer, { color: tint }]} selectable>
            {shown || t('answerReview.noAnswer')}
          </Text>
        </View>
      </View>
      {!isCorrect && (
        <View style={styles.row}>
          <Ionicons name="arrow-forward-circle" size={22} color={colors.success} />
          <View style={styles.flex}>
            <Text style={styles.label}>
              {timedOut ? t('answerReview.timeUpCorrect') : t('answerReview.correctAnswer')}
            </Text>
            <Text style={[styles.answer, { color: colors.success }]} selectable>
              {correct}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1.5,
      padding: spacing.md,
      gap: spacing.sm,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    label: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '700' },
    answer: { fontSize: typography.scale.lg, fontWeight: '800', letterSpacing: 0.5 },
  });
}
