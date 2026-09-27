import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  checkHistoryAnswer,
  getHistoryForDate,
  type CatchUpAnswerResult,
  type CatchUpView,
} from '@/services/quests';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { LetterBoxInput, type RevealedLetter } from '@/components/LetterBoxInput';
import { FadeInUp } from '@/components/FadeInUp';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'CatchUpReplay'>;

type Phase = 'loading' | 'active' | 'submitting' | 'feedback' | 'complete' | 'error';

/**
 * Same "YYYY-MM-DD is the player's own local calendar date" note as
 * CatchUpCalendarScreen -- constructed locally rather than via
 * `new Date(localDate)` to avoid a UTC-midnight off-by-one once
 * .toLocaleDateString() renders it back in the device's own zone.
 */
function parseLocalDate(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Turns one catch-up word's `displayPattern` ("C _ L O U R") back into
 * the `revealed` shape LetterBoxInput expects: every position NOT in
 * `missingIndexes` is already shown, pre-filled and locked, exactly the
 * same as a hint-revealed letter elsewhere in the app -- the player
 * only ever types the missing ones.
 */
function revealedFromPattern(displayPattern: string, missingIndexes: number[]): RevealedLetter[] {
  const missingSet = new Set(missingIndexes);
  return displayPattern
    .split(' ')
    .map((letter, position) => ({ position, letter }))
    .filter(({ position, letter }) => !missingSet.has(position) && letter !== '_');
}

/**
 * Reconstructs the full word from the player's typed characters (which
 * only cover the still-editable, non-revealed positions -- see
 * LetterBoxInput's `revealed` prop) plus the pre-revealed letters, so
 * the server always receives a complete answer of the right length.
 * Identical to CompleteItScreen/ScrambleQuestScreen's own helper of the
 * same name -- this screen was missing it entirely (bug report, Barth
 * Sept 2026: a correctly-typed answer on a partially-revealed word was
 * marked wrong, because only the typed *blanks* were being sent to
 * checkHistoryAnswer instead of the assembled full word; the shown
 * "correct answer" then looked identical to what the player typed,
 * since the letters they saw on screen — reveals plus their own
 * correct typing — already spelled it).
 */
function mergeRevealedAnswer(
  typed: string,
  revealedLetters: RevealedLetter[],
  length: number,
): string {
  const revealedMap = new Map(revealedLetters.map((r) => [r.position, r.letter]));
  const editablePositions = Array.from({ length }, (_, i) => i).filter((i) => !revealedMap.has(i));
  const letters = Array.from({ length }, (_, i) => revealedMap.get(i) ?? '');
  editablePositions.forEach((position, editableIndex) => {
    letters[position] = typed[editableIndex] ?? '';
  });
  return letters.join('');
}

/**
 * Catch-up replay (product request, Sept 2026 — "without it giving you
 * any new XP beyond just answering what you missed"): walks through
 * one past day's Guess words one at a time, purely for review. No
 * timer, no hints/synonyms/reveal-letter affordances, no XP/streak/
 * mastery bookkeeping anywhere in this screen -- backend
 * QuestsService.checkHistoryAnswer is equally inert on that front, so
 * this screen never has anything reward-shaped to show, only right/
 * wrong + the correct spelling.
 */
export function CatchUpReplayScreen({ route, navigation }: Props) {
  const { localDate } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('catchUp');
  const accessToken = useAuthStore((s) => s.accessToken);

  const [phase, setPhase] = useState<Phase>('loading');
  const [view, setView] = useState<CatchUpView | null>(null);
  const [wordIndex, setWordIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<CatchUpAnswerResult | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setPhase('loading');
    try {
      const result = await getHistoryForDate(accessToken, localDate);
      setView(result);
      setWordIndex(0);
      setAnswer('');
      setFeedback(null);
      setCorrectCount(0);
      setPhase('active');
    } catch {
      setPhase('error');
    }
  }, [accessToken, localDate]);

  useEffect(() => {
    load();
  }, [load]);

  const current = view?.words[wordIndex] ?? null;
  const revealed = current
    ? revealedFromPattern(current.displayPattern, current.missingIndexes)
    : [];

  const onSubmit = async () => {
    if (!accessToken || !current || !answer.trim() || phase === 'submitting') return;
    setPhase('submitting');
    try {
      const fullAnswer = mergeRevealedAnswer(answer.trim(), revealed, current.wordLength);
      const result = await checkHistoryAnswer(accessToken, current.wordId, fullAnswer);
      if (result.correct) setCorrectCount((c) => c + 1);
      setFeedback(result);
      setPhase('feedback');
    } catch {
      setPhase('error');
    }
  };

  const onContinue = () => {
    if (!view) return;
    if (wordIndex + 1 >= view.words.length) {
      setPhase('complete');
      return;
    }
    setWordIndex((i) => i + 1);
    setAnswer('');
    setFeedback(null);
    setPhase('active');
  };

  if (phase === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{t('replayLoadError')}</Text>
      </View>
    );
  }

  if (phase === 'complete' && view) {
    return (
      <ScrollView style={styles.flexFill} contentContainerStyle={styles.centeredScrollContent}>
        <Ionicons name="checkmark-circle" size={56} color={colors.success} />
        <Text style={styles.completeTitle}>{t('completeTitle')}</Text>
        <Text style={styles.completeSubtitle}>
          {t('completeSubtitle', {
            count: correctCount,
            total: view.words.length,
            date: parseLocalDate(localDate).toLocaleDateString(),
          })}
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('backToCalendar')}
        >
          <Text style={styles.buttonText}>{t('backToCalendar')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!current || !view) return null;

  return (
    <View style={styles.flexFill}>
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton onPress={() => navigation.goBack()} />

        <Text style={styles.progressLabel}>
          {t('replayProgressLabel', { current: wordIndex + 1, total: view.words.length })}
        </Text>
        <Text style={styles.noRewardNote}>{t('noRewardNote')}</Text>

        <View style={styles.puzzleCard}>
          <Text style={styles.partOfSpeech}>{current.partOfSpeech}</Text>
          <Text style={styles.definition}>{current.definition}</Text>
        </View>

        {phase === 'active' && (
          <>
            <LetterBoxInput
              value={answer}
              onChangeText={setAnswer}
              length={current.wordLength}
              colors={colors}
              revealed={revealed}
              accessibilityLabel={t('answerAccessibilityLabel')}
              onSubmitEditing={onSubmit}
              autoFocus
            />
            <Pressable
              style={[styles.button, !answer.trim() && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={!answer.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('submit')}
            >
              <Text style={styles.buttonText}>{t('submit')}</Text>
            </Pressable>
          </>
        )}

        {phase === 'submitting' && (
          <View style={styles.centeredInline}>
            <ActivityIndicator color={colors.arcaneSoft} />
          </View>
        )}

        {phase === 'feedback' && feedback && (
          <FadeInUp style={styles.feedbackBar}>
            <Text
              style={[
                styles.feedbackText,
                { color: feedback.correct ? colors.success : colors.danger },
              ]}
            >
              {feedback.correct ? t('correctFeedback') : t('incorrectFeedback')}
            </Text>
            {!feedback.correct && (
              <Text style={styles.revealText}>
                {t('revealPrefix')} <Text style={styles.revealWord}>{feedback.correctWord}</Text>
              </Text>
            )}
            <Pressable
              style={styles.button}
              onPress={onContinue}
              accessibilityRole="button"
              accessibilityLabel={t('continue')}
            >
              <Text style={styles.buttonText}>{t('continue')}</Text>
            </Pressable>
          </FadeInUp>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    flexFill: { flex: 1 },
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.md,
      gap: spacing.lg,
    },
    centered: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.md,
    },
    centeredInline: { alignItems: 'center', paddingVertical: spacing.md },
    centeredScrollContent: {
      flexGrow: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.md,
    },
    error: { color: colors.danger, fontSize: typography.scale.md, textAlign: 'center' },
    progressLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    noRewardNote: { color: colors.inkMuted, fontSize: typography.scale.xs },
    puzzleCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
    },
    partOfSpeech: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    definition: {
      color: colors.glyph,
      fontSize: typography.scale.sm,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    button: {
      backgroundColor: colors.arcane,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    feedbackBar: { gap: spacing.sm },
    feedbackText: { fontSize: typography.scale.md, fontWeight: '700' },
    revealText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    revealWord: { color: colors.ink, fontWeight: '700' },
    completeTitle: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
      textAlign: 'center',
    },
    completeSubtitle: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
      textAlign: 'center',
    },
  });
}
