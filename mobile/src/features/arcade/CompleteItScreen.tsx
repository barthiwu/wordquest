import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  startCompleteIt,
  submitCompleteItAnswer,
  type CompleteItAnswerResult,
  type CompleteItChallenge,
} from '@/services/completeIt';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'CompleteIt'>;

type Phase = 'loading' | 'active' | 'submitting' | 'feedback' | 'complete' | 'error';

/**
 * Complete It (spec §5 sibling of ScrambleQuest) — the player sees the
 * word's own example sentence with the target word blanked out, plus
 * its definition/part of speech, and types the missing word. No hints
 * at all (COMPLETE_IT_CONFIG.HINTS_ENABLED is false), unlike
 * ScrambleQuest — this screen is ScrambleQuestScreen's structure minus
 * the hint UI, with a sentence+definition card in place of the
 * scrambled-letters puzzle. The local countdown is purely cosmetic: the
 * server decides timeout from its own recorded start time
 * (CompleteItService), so a submission landing right as this screen's
 * clock hits zero is judged by the server's clock, not this one's.
 */
export function CompleteItScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['completeIt', 'scrambleQuest', 'arcade']);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [phase, setPhase] = useState<Phase>('loading');
  const [challenge, setChallenge] = useState<CompleteItChallenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<CompleteItAnswerResult | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const autoSubmittedRef = useRef(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setPhase('loading');
    try {
      const view = await startCompleteIt(accessToken);
      setChallenge(view);
      setAnswer('');
      autoSubmittedRef.current = false;
      setPhase('active');
    } catch {
      setPhase('error');
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Cosmetic-only countdown, ticked from the server-issued deadlineAt.
  useEffect(() => {
    if (phase !== 'active' || !challenge) return undefined;
    const tick = () => {
      const secondsLeft = Math.max(
        0,
        Math.ceil((new Date(challenge.deadlineAt).getTime() - Date.now()) / 1000),
      );
      setRemainingSeconds(secondsLeft);
      if (secondsLeft <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        handleSubmit(answer);
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, challenge]);

  const handleSubmit = async (submittedAnswer: string) => {
    if (!accessToken || !challenge || phase === 'submitting') return;
    setPhase('submitting');
    try {
      const result = await submitCompleteItAnswer(
        accessToken,
        challenge.sessionId,
        submittedAnswer,
      );
      setFeedback(result);
      setPhase('feedback');
    } catch {
      setPhase('error');
    }
  };

  const handleContinue = () => {
    if (!feedback) return;
    if (feedback.sessionComplete || !feedback.nextChallenge) {
      setPhase('complete');
      return;
    }
    setChallenge(feedback.nextChallenge);
    setFeedback(null);
    setAnswer('');
    autoSubmittedRef.current = false;
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
        <Text style={styles.error}>{t('completeIt:genericError')}</Text>
      </View>
    );
  }

  if (phase === 'complete' && feedback) {
    return (
      <ScrollView style={styles.flexFill} contentContainerStyle={styles.centeredScrollContent}>
        <Text style={styles.title}>{t('scrambleQuest:sessionCompleteTitle')}</Text>
        <Text style={styles.summaryLine}>
          {t('scrambleQuest:sessionXpEarned', { xp: feedback.totalXpAwarded })}
        </Text>
        <Text style={styles.summaryLine}>
          {t('scrambleQuest:sessionCorrectSummary', {
            correct: feedback.correctCount,
            total: feedback.wordsTotal,
          })}
        </Text>
        <Text style={styles.summaryLine}>
          {t('scrambleQuest:sessionLongestStreak', { streak: feedback.longestStreak })}
        </Text>
        <Pressable
          style={styles.button}
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel={t('scrambleQuest:playAgain')}
        >
          <Text style={styles.buttonText}>{t('scrambleQuest:playAgain')}</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('arcade:backToPlay')}
        >
          <Text style={styles.secondaryButtonText}>{t('arcade:backToPlay')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!challenge) return null;

  return (
    <View style={styles.flexFill}>
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={styles.headerRow}>
          <Text style={styles.progressLabel}>
            {t('scrambleQuest:progressLabel', {
              current: challenge.wordIndex + 1,
              total: challenge.wordsTotal,
            })}
          </Text>
          <View style={styles.streakPill}>
            <Text style={styles.streakPillText}>
              {t('scrambleQuest:streakLabel')} {challenge.currentStreak}
            </Text>
          </View>
        </View>

        <View style={styles.timerRow}>
          <Text style={[styles.timerText, remainingSeconds <= 10 && styles.timerTextUrgent]}>
            {remainingSeconds}s
          </Text>
        </View>

        <View style={styles.puzzleCard}>
          <Text style={styles.sentence}>{challenge.sentenceWithBlank}</Text>
          <Text style={styles.partOfSpeech}>{challenge.partOfSpeech}</Text>
          <Text style={styles.definition}>{challenge.definition}</Text>
        </View>

        {phase === 'active' && (
          <>
            <TextInput
              style={styles.input}
              value={answer}
              onChangeText={setAnswer}
              placeholder={t('scrambleQuest:answerPlaceholder')}
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t('scrambleQuest:yourAnswerLabel')}
              onSubmitEditing={() => handleSubmit(answer)}
            />
            <Pressable
              style={[styles.button, !answer.trim() && styles.buttonDisabled]}
              onPress={() => handleSubmit(answer)}
              disabled={!answer.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('scrambleQuest:submit')}
            >
              <Text style={styles.buttonText}>{t('scrambleQuest:submit')}</Text>
            </Pressable>
          </>
        )}

        {phase === 'submitting' && (
          <View style={styles.centeredInline}>
            <ActivityIndicator color={colors.arcaneSoft} />
          </View>
        )}

        {phase === 'feedback' && feedback && (
          <View style={styles.feedbackBar}>
            <Text
              style={[
                styles.feedbackText,
                { color: feedback.isCorrect ? colors.success : colors.danger },
              ]}
            >
              {feedback.timedOut
                ? t('scrambleQuest:timedOutFeedback')
                : feedback.isCorrect
                  ? t('scrambleQuest:correctFeedback', { xp: feedback.xpAwarded })
                  : t('scrambleQuest:incorrectFeedback')}
            </Text>
            {!feedback.isCorrect && (
              <Text style={styles.revealText}>
                {t('scrambleQuest:revealPrefix')}{' '}
                <Text style={styles.revealWord}>{feedback.correctAnswer}</Text>
              </Text>
            )}
            <Pressable
              style={styles.button}
              onPress={handleContinue}
              accessibilityRole="button"
              accessibilityLabel={t('scrambleQuest:continue')}
            >
              <Text style={styles.buttonText}>{t('scrambleQuest:continue')}</Text>
            </Pressable>
          </View>
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
    title: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
      textAlign: 'center',
    },
    summaryLine: { color: colors.ink, fontSize: typography.scale.md, textAlign: 'center' },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    progressLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    streakPill: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    streakPillText: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
    timerRow: { alignItems: 'center' },
    timerText: {
      color: colors.ink,
      fontSize: typography.scale.xxl,
      fontWeight: typography.display.weight,
    },
    timerTextUrgent: { color: colors.danger },
    puzzleCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
    },
    sentence: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: '700',
      textAlign: 'center',
    },
    partOfSpeech: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    definition: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    input: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.ink,
      fontSize: typography.scale.md,
      padding: spacing.md,
    },
    button: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    secondaryButton: {
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryButtonText: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
      fontWeight: '600',
    },
    feedbackBar: { gap: spacing.sm },
    feedbackText: { fontSize: typography.scale.md, fontWeight: '700' },
    revealText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    revealWord: { color: colors.ink, fontWeight: '700' },
  });
}
