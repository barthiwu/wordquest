import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing, radius, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { useFeedbackPromptStore } from '@/state/feedbackPromptStore';
import { submitFeedback } from '@/services/feedback';

interface RatingOption {
  emoji: string;
  labelKey: string;
  /** 1-5, this option's ordinal position in the spec's own scale order
   * (Telemetry spec §18: Too easy / Just right / Okay / Difficult / Too
   * difficult) — not a valence score, just "how far along this
   * particular five-point scale." */
  rating: number;
}

const RATING_OPTIONS: RatingOption[] = [
  { emoji: '🔥', labelKey: 'tooEasy', rating: 1 },
  { emoji: '👍', labelKey: 'justRight', rating: 2 },
  { emoji: '😐', labelKey: 'okay', rating: 3 },
  { emoji: '😕', labelKey: 'difficult', rating: 4 },
  { emoji: '🥵', labelKey: 'tooDifficult', rating: 5 },
];

/** Only the two "too hard" ratings drill into the follow-up reasons
 * step (spec §18's "If they select difficult:" branch). */
const DIFFICULT_THRESHOLD = 4;

const REASON_KEYS = [
  'reasonWordsTooDifficult',
  'reasonCluesNotHelpful',
  'reasonNotEnoughTime',
  'reasonDidNotUnderstand',
  'reasonSomethingElse',
] as const;

type Step = 'hidden' | 'rating' | 'reasons' | 'done';

/**
 * Word Duel's targeted lightweight feedback prompt (Telemetry spec
 * §18-§19) — shown once on the post-match result screen, gated by a
 * 3-day cross-surface cooldown (feedbackPromptStore.ts). Deliberately
 * self-contained: WordDuelScreen just renders `<WordDuelFeedbackPrompt
 * matchId={...} />` unconditionally in the 'complete' phase and this
 * component decides for itself whether it has anything to show.
 *
 * The cooldown is recorded the moment this prompt actually renders
 * (not on submit) — spec §19 caps how often we ASK, not how often a
 * player answers.
 */
export function WordDuelFeedbackPrompt({ matchId }: { matchId: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation('feedback');
  const accessToken = useAuthStore((s) => s.accessToken);
  const isHydrated = useFeedbackPromptStore((s) => s.isHydrated);
  const canShowPrompt = useFeedbackPromptStore((s) => s.canShowPrompt);
  const recordShown = useFeedbackPromptStore((s) => s.recordShown);

  const [step, setStep] = useState<Step>('hidden');
  const [rating, setRating] = useState<number | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isHydrated || step !== 'hidden') return;
    if (canShowPrompt()) {
      recordShown();
      setStep('rating');
    }
    // Runs once hydration completes; canShowPrompt/recordShown are
    // stable zustand actions, matchId identifies this one match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, matchId]);

  const submit = async (finalRating: number, reasons: string[]) => {
    if (!accessToken) {
      setStep('done');
      return;
    }
    setSubmitting(true);
    try {
      await submitFeedback(accessToken, {
        type: 'PROMPT',
        category: 'WORD_DUEL',
        rating: finalRating,
        screen: 'WordDuel',
        context: reasons.length > 0 ? { matchId, reasons } : { matchId },
      });
    } catch {
      // A lightweight prompt failing to submit isn't worth surfacing
      // as an error to a player who just finished a match — same
      // "never interfere with gameplay" principle the whole spec is
      // built on (spec §1's "Principle").
    } finally {
      setSubmitting(false);
      setStep('done');
    }
  };

  const onSelectRating = (option: RatingOption) => {
    setRating(option.rating);
    if (option.rating >= DIFFICULT_THRESHOLD) {
      setStep('reasons');
      return;
    }
    void submit(option.rating, []);
  };

  const toggleReason = (key: string) => {
    setSelectedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (step === 'hidden' || step === 'done') return null;

  return (
    <View style={styles.card}>
      {step === 'rating' && (
        <>
          <Text style={styles.title}>{t('wordDuelPrompt.title')}</Text>
          <View style={styles.optionRow}>
            {RATING_OPTIONS.map((option) => (
              <Pressable
                key={option.labelKey}
                style={styles.optionButton}
                onPress={() => onSelectRating(option)}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel={t(`wordDuelPrompt.${option.labelKey}`)}
              >
                <Text style={styles.optionEmoji}>{option.emoji}</Text>
                <Text style={styles.optionLabel}>{t(`wordDuelPrompt.${option.labelKey}`)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {step === 'reasons' && (
        <>
          <Text style={styles.title}>{t('wordDuelPrompt.reasonsTitle')}</Text>
          <View style={styles.reasonList}>
            {REASON_KEYS.map((key) => {
              const selected = selectedReasons.has(key);
              return (
                <Pressable
                  key={key}
                  style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                  onPress={() => toggleReason(key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={t(`wordDuelPrompt.${key}`)}
                >
                  <Text style={styles.reasonText}>{t(`wordDuelPrompt.${key}`)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={styles.submitButton}
            onPress={() => rating !== null && void submit(rating, Array.from(selectedReasons))}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel={t('send')}
          >
            <Text style={styles.submitButtonText}>{t('send')}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.md,
      marginTop: spacing.lg,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.md,
      fontWeight: '700',
      textAlign: 'center',
    },
    optionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
    optionButton: { alignItems: 'center', flex: 1, gap: spacing.xs / 2 },
    optionEmoji: { fontSize: 28 },
    optionLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      textAlign: 'center',
    },
    reasonList: { gap: spacing.xs },
    reasonRow: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    reasonRowSelected: { borderColor: colors.arcane, backgroundColor: colors.arcaneSoft },
    reasonText: { color: colors.ink, fontSize: typography.scale.sm },
    submitButton: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    submitButtonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  });
}
