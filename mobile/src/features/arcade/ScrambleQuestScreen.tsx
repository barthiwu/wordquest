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
  requestScrambleHint,
  startScrambleQuest,
  submitScrambleAnswer,
  type ScrambleQuestAnswerResult,
  type ScrambleQuestChallenge,
} from '@/services/scrambleQuest';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ScrambleQuest'>;

type Phase = 'loading' | 'active' | 'submitting' | 'feedback' | 'complete' | 'error';

/**
 * ScrambleQuest (spec §5) — one word at a time, 30s server-authoritative
 * timer, up to 3 letter-reveal hints, immediate advance on a correct
 * answer. The local countdown here is purely cosmetic: the server
 * decides timeout from its own recorded start time (ScrambleQuestService
 * §11), so a submission that lands right as this screen's clock hits
 * zero is judged by the server's clock, not this one's.
 */
export function ScrambleQuestScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['scrambleQuest', 'arcade']);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [phase, setPhase] = useState<Phase>('loading');
  const [challenge, setChallenge] = useState<ScrambleQuestChallenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<ScrambleQuestAnswerResult | null>(null);
  const [showMeaning, setShowMeaning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const autoSubmittedRef = useRef(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setPhase('loading');
    try {
      const view = await startScrambleQuest(accessToken);
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
    setShowMeaning(false);
    try {
      const result = await submitScrambleAnswer(accessToken, challenge.sessionId, submittedAnswer);
      setFeedback(result);
      setPhase('feedback');
    } catch {
      setPhase('error');
    }
  };

  const handleHint = async () => {
    if (!accessToken || !challenge || challenge.hintsRemaining <= 0) return;
    try {
      const hint = await requestScrambleHint(accessToken, challenge.sessionId);
      setChallenge((prev) =>
        prev
          ? {
              ...prev,
              hintsRemaining: hint.hintsRemaining,
              revealedLetters: [
                ...prev.revealedLetters,
                { position: hint.position, letter: hint.letter },
              ],
            }
          : prev,
      );
    } catch {
      // A failed hint request (rate limit, race) just leaves the hint
      // count where it was -- not worth interrupting the game over.
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
        <Text style={styles.error}>{t('genericError')}</Text>
      </View>
    );
  }

  if (phase === 'complete' && feedback) {
    return (
      <ScrollView style={styles.flexFill} contentContainerStyle={styles.centeredScrollContent}>
        <Text style={styles.title}>{t('sessionCompleteTitle')}</Text>
        <Text style={styles.summaryLine}>
          {t('sessionXpEarned', { xp: feedback.totalXpAwarded })}
        </Text>
        <Text style={styles.summaryLine}>
          {t('sessionCorrectSummary', {
            correct: feedback.correctCount,
            total: feedback.wordsTotal,
          })}
        </Text>
        <Text style={styles.summaryLine}>
          {t('sessionLongestStreak', { streak: feedback.longestStreak })}
        </Text>
        <Pressable
          style={styles.button}
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel={t('playAgain')}
        >
          <Text style={styles.buttonText}>{t('playAgain')}</Text>
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

  const skeleton = Array.from({ length: challenge.wordLength }, (_, i) => {
    const revealed = challenge.revealedLetters.find((r) => r.position === i);
    return revealed ? revealed.letter.toUpperCase() : '_';
  }).join(' ');

  return (
    <View style={styles.flexFill}>
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={styles.headerRow}>
          <Text style={styles.progressLabel}>
            {t('progressLabel', { current: challenge.wordIndex + 1, total: challenge.wordsTotal })}
          </Text>
          <View style={styles.streakPill}>
            <Text style={styles.streakPillText}>
              {t('streakLabel')} {challenge.currentStreak}
            </Text>
          </View>
        </View>

        <View style={styles.timerRow}>
          <Text style={[styles.timerText, remainingSeconds <= 10 && styles.timerTextUrgent]}>
            {remainingSeconds}s
          </Text>
        </View>

        <View style={styles.puzzleCard}>
          <Text style={styles.scrambledLetters}>
            {challenge.scrambledLetters.toUpperCase().split('').join(' ')}
          </Text>
          {challenge.revealedLetters.length > 0 && <Text style={styles.skeleton}>{skeleton}</Text>}
        </View>

        {phase === 'active' && (
          <>
            <TextInput
              style={styles.input}
              value={answer}
              onChangeText={setAnswer}
              placeholder={t('answerPlaceholder')}
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t('yourAnswerLabel')}
              onSubmitEditing={() => handleSubmit(answer)}
            />
            <Pressable
              style={[styles.button, !answer.trim() && styles.buttonDisabled]}
              onPress={() => handleSubmit(answer)}
              disabled={!answer.trim()}
              accessibilityRole="button"
              accessibilityLabel={t('submit')}
            >
              <Text style={styles.buttonText}>{t('submit')}</Text>
            </Pressable>
            <Pressable
              style={[styles.hintButton, challenge.hintsRemaining <= 0 && styles.buttonDisabled]}
              onPress={handleHint}
              disabled={challenge.hintsRemaining <= 0}
              accessibilityRole="button"
              accessibilityLabel={t('hintButton')}
            >
              <Text style={styles.hintButtonText}>
                {challenge.hintsRemaining > 0
                  ? `${t('hintButton')} (${t('hintsRemainingLabel', { count: challenge.hintsRemaining })})`
                  : t('noHintsRemaining')}
              </Text>
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
                ? t('timedOutFeedback')
                : feedback.isCorrect
                  ? t('correctFeedback', { xp: feedback.xpAwarded })
                  : t('incorrectFeedback')}
            </Text>
            {!feedback.isCorrect && (
              <Text style={styles.revealText}>
                {t('revealPrefix')} <Text style={styles.revealWord}>{feedback.correctAnswer}</Text>
              </Text>
            )}
            <Pressable
              style={styles.meaningButton}
              onPress={() => setShowMeaning((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={t('meaningButton')}
            >
              <Text style={styles.meaningButtonText}>{t('meaningButton')}</Text>
            </Pressable>
            {showMeaning && (
              <View style={styles.meaningCard}>
                <Text style={styles.meaningPartOfSpeech}>{feedback.meaning.partOfSpeech}</Text>
                <Text style={styles.meaningDefinition}>{feedback.meaning.definition}</Text>
                {feedback.meaning.synonyms.length > 0 && (
                  <Text style={styles.meaningSynonyms}>
                    {t('synonymsListLabel', { list: feedback.meaning.synonyms.join(', ') })}
                  </Text>
                )}
              </View>
            )}
            <Pressable
              style={styles.button}
              onPress={handleContinue}
              accessibilityRole="button"
              accessibilityLabel={t('continue')}
            >
              <Text style={styles.buttonText}>{t('continue')}</Text>
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
    scrambledLetters: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: '700',
      letterSpacing: 4,
    },
    skeleton: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.lg,
      fontWeight: '700',
      letterSpacing: 4,
    },
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
    hintButton: {
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.arcaneSoft,
    },
    hintButtonText: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
    meaningButton: {
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    meaningButtonText: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    meaningCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
    },
    meaningPartOfSpeech: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    meaningDefinition: { color: colors.ink, fontSize: typography.scale.sm },
    meaningSynonyms: { color: colors.inkMuted, fontSize: typography.scale.xs },
    feedbackBar: { gap: spacing.sm },
    feedbackText: { fontSize: typography.scale.md, fontWeight: '700' },
    revealText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    revealWord: { color: colors.ink, fontWeight: '700' },
  });
}
