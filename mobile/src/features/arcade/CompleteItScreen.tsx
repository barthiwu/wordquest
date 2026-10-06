import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  requestCompleteItHint,
  startCompleteIt,
  submitCompleteItAnswer,
  type CompleteItAnswerResult,
  type CompleteItChallenge,
} from '@/services/completeIt';
import { useAuthStore } from '@/state/authStore';
import { AliDeferredRecap } from '@/components/AliDeferredRecap';
import type { AliExpressionCue } from '@/services/aliExpression';
import { AliBubble } from '@/components/AliBubble';
import { AliStreakPopout } from '@/components/AliStreakPopout';
import { ArcadeHeroResults } from '@/components/ArcadeHeroResults';
import { BackButton } from '@/components/BackButton';
import { ProtoGameHeader } from '@/features/proto/ProtoGameHeader';
import { VersusBar } from '@/components/VersusBar';
import { VersusResultCard } from '@/components/VersusResultCard';
import { CountdownRing } from '@/components/CountdownRing';
import { LetterBoxInput } from '@/components/LetterBoxInput';
import { trackEvent } from '@/services/analyticsClient';
import { ApiError } from '@/services/apiClient';
import { isPlayLimitError } from '@/services/arcadePlays';
import { useArcadePlaysStore } from '@/state/arcadePlaysStore';
import { ArcadeLimitReached } from '@/components/ArcadeLimitReached';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'CompleteIt'>;

type Phase = 'loading' | 'active' | 'submitting' | 'feedback' | 'complete' | 'error';

/** Same "Bold Modern" design-canvas language ScrambleQuest shipped
 * (Sept 2026 review) -- gold accents, glowing countdown ring, elevated
 * card -- applied here for visual consistency across Arcade (Barth:
 * "Let's do same for the Complete It, and the Word Duel"). */
const URGENT_THRESHOLD_SECONDS = 10;

/**
 * Reconstructs the full word from the player's typed characters (which
 * only cover the still-editable, non-hint-revealed positions -- see
 * LetterBoxInput's `revealed` prop) plus the hint-revealed letters, so
 * the server always receives a complete answer of the right length.
 * Identical to ScrambleQuestScreen's own helper of the same name.
 */
function mergeRevealedAnswer(
  typed: string,
  revealedLetters: { position: number; letter: string }[],
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
 * Complete It (spec §5 sibling of ScrambleQuest) — the player sees the
 * word's own example sentence with the target word blanked out, plus
 * its definition/part of speech, and types the missing word. Hints work
 * the same way ScrambleQuest's do (an on-demand, server-tracked
 * letter-reveal button, same XP penalty via the shared reward engine),
 * just sized differently -- 60% of the word's own letter count, rounded,
 * instead of ScrambleQuest's flat 3-hint cap (2026-09 decision, Barth).
 * This screen is ScrambleQuestScreen's structure with a sentence+
 * definition card in place of the scrambled-letters puzzle (no shuffle
 * button or synonyms reveal here -- Complete It has neither). The local
 * countdown is purely cosmetic: the server decides timeout from its own
 * recorded start time (CompleteItService), so a submission landing
 * right as this screen's clock hits zero is judged by the server's
 * clock, not this one's.
 */
export function CompleteItScreen({ navigation, route }: Props) {
  const versusMatchId = route.params?.versusMatchId;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['completeIt', 'scrambleQuest', 'arcade']);
  const { t: tp } = useTranslation('proto');
  const accessToken = useAuthStore((s) => s.accessToken);

  const [phase, setPhase] = useState<Phase>('loading');
  // Set when the server refuses the start because today's plays are used up.
  const [limitHit, setLimitHit] = useState(false);
  const [challenge, setChallenge] = useState<CompleteItChallenge | null>(null);
  const [answer, setAnswer] = useState('');
  const answerRef = useRef('');
  answerRef.current = answer;
  const submitRef = useRef<(typed: string) => void>(() => undefined);
  const [feedback, setFeedback] = useState<CompleteItAnswerResult | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const autoSubmittedRef = useRef(false);
  const lastVibratedSecondRef = useRef<number | null>(null);
  const [aliBubble, setAliBubble] = useState<{
    id: number;
    message: string;
    expression: AliExpressionCue;
  } | null>(null);
  const aliBubbleCounter = useRef(0);

  // See ScrambleQuestScreen's identical pattern/comment (Telemetry spec §11).
  const completedRef = useRef(false);
  useEffect(() => {
    return () => {
      if (!completedRef.current) {
        trackEvent('ARCADE_SESSION_ABANDONED', { game: 'COMPLETE_IT' });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setPhase('loading');
    try {
      const view = await startCompleteIt(accessToken, versusMatchId);
      useArcadePlaysStore.getState().applyNotice(view.playLimit);
      trackEvent('ARCADE_SESSION_STARTED', { game: 'COMPLETE_IT' });
      setChallenge(view);
      setAnswer('');
      autoSubmittedRef.current = false;
      lastVibratedSecondRef.current = null;
      setPhase('active');
    } catch (err) {
      if (isPlayLimitError(err)) {
        useArcadePlaysStore.getState().markLocked('COMPLETE_IT');
        setLimitHit(true);
      }
      setPhase('error');
    }
  }, [accessToken, versusMatchId]);

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
      if (
        secondsLeft <= URGENT_THRESHOLD_SECONDS &&
        lastVibratedSecondRef.current !== secondsLeft
      ) {
        lastVibratedSecondRef.current = secondsLeft;
        Vibration.vibrate(80);
      }
      if (secondsLeft <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        // Refs, not the values captured when this effect started: the timer
        // used to auto-submit whatever was typed back then (usually '').
        submitRef.current(answerRef.current);
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, challenge]);

  const handleSubmit = async (typedAnswer: string) => {
    if (!accessToken || !challenge || phase === 'submitting') return;
    setPhase('submitting');
    const fullAnswer = mergeRevealedAnswer(
      typedAnswer,
      challenge.revealedLetters,
      challenge.wordLength,
    );
    try {
      const result = await submitCompleteItAnswer(accessToken, challenge.sessionId, fullAnswer);
      trackEvent('ARCADE_ANSWER_SUBMITTED', { game: 'COMPLETE_IT', isCorrect: result.isCorrect });
      setFeedback(result);
      if (result.aliQuickReaction && result.aliQuickExpression) {
        aliBubbleCounter.current += 1;
        setAliBubble({
          id: aliBubbleCounter.current,
          message: result.aliQuickReaction,
          expression: result.aliQuickExpression,
        });
      }
      setPhase('feedback');
    } catch (err) {
      trackEvent('GAMEPLAY_ERROR', {
        game: 'COMPLETE_IT',
        step: 'submit',
        status: err instanceof ApiError ? err.status : undefined,
      });
      setPhase('error');
    }
  };
  submitRef.current = (typed: string) => {
    void handleSubmit(typed);
  };

  const handleHint = async () => {
    if (!accessToken || !challenge || challenge.hintsRemaining <= 0) return;
    try {
      const hint = await requestCompleteItHint(accessToken, challenge.sessionId);
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
      completedRef.current = true;
      trackEvent('ARCADE_SESSION_COMPLETED', { game: 'COMPLETE_IT' });
      // A head-to-head play counts toward the daily cap only once finished.
      useArcadePlaysStore.getState().applyNotice(feedback.playLimit);
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

  if (phase === 'error' && limitHit) {
    return <ArcadeLimitReached game="COMPLETE_IT" onBack={() => navigation.goBack()} />;
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
        <ArcadeHeroResults
          colors={colors}
          title={t('scrambleQuest:sessionCompleteTitle')}
          subtitle={t('scrambleQuest:sessionCorrectSummary', {
            correct: feedback.correctCount,
            total: feedback.wordsTotal,
          })}
          correctCount={feedback.correctCount}
          totalCount={feedback.wordsTotal}
          stats={[
            {
              icon: 'flash',
              text: t('scrambleQuest:sessionXpEarned', { xp: feedback.totalXpAwarded }),
            },
            {
              icon: 'flame',
              text: t('scrambleQuest:sessionLongestStreak', { streak: feedback.longestStreak }),
            },
          ]}
          primaryLabel={
            versusMatchId ? t('arcade:versus.result.rematch') : t('scrambleQuest:playAgain')
          }
          onPrimary={
            versusMatchId ? () => navigation.replace('ArcadeVersus', { game: 'COMPLETE_IT' }) : load
          }
          secondaryLabel={t('arcade:backToPlay')}
          onSecondary={() => navigation.goBack()}
        />
        {versusMatchId ? <VersusResultCard matchId={versusMatchId} /> : null}
        <AliDeferredRecap
          reactions={feedback.deferredAliReactions ?? []}
          colors={colors}
          style={styles.deferredRecap}
        />
      </ScrollView>
    );
  }

  if (!challenge) return null;

  return (
    <View style={styles.flexFill}>
      {aliBubble && (
        <AliBubble
          key={aliBubble.id}
          message={aliBubble.message}
          expression={aliBubble.expression}
          onDismiss={() => setAliBubble(null)}
        />
      )}
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton onPress={() => navigation.goBack()} />
        <ProtoGameHeader line={tp('gameComplete')} />
        {versusMatchId ? <VersusBar matchId={versusMatchId} /> : null}

        <View style={styles.headerRow}>
          <Text style={styles.progressLabel}>
            {t('scrambleQuest:progressLabel', {
              current: challenge.wordIndex + 1,
              total: challenge.wordsTotal,
            })}
          </Text>
          <AliStreakPopout
            pillStyle={styles.streakPill}
            textStyle={styles.streakPillText}
            label={`${t('scrambleQuest:streakLabel')} ${challenge.currentStreak}`}
            reaction={feedback?.streakReaction ?? null}
            colors={colors}
          />
        </View>

        <CountdownRing
          remainingSeconds={remainingSeconds}
          totalSeconds={challenge.timeLimitSeconds}
          colors={colors}
          urgentThresholdSeconds={URGENT_THRESHOLD_SECONDS}
        />

        <View style={styles.puzzleCard}>
          <LinearGradient
            colors={[colors.glyph, colors.arcane]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.puzzleCardAccentBar}
          />
          <Text style={styles.sentence}>{challenge.sentenceWithBlank}</Text>
          <Text style={styles.partOfSpeech}>{challenge.partOfSpeech}</Text>
          <Text style={styles.definition}>
            {t('completeIt:hintFormat', { definition: challenge.definition })}
          </Text>
        </View>

        {phase === 'active' && (
          <>
            <LetterBoxInput
              value={answer}
              onChangeText={setAnswer}
              length={challenge.wordLength}
              colors={colors}
              accessibilityLabel={t('scrambleQuest:yourAnswerLabel')}
              onSubmitEditing={() => handleSubmit(answer)}
              revealed={challenge.revealedLetters}
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
            <Pressable
              style={[styles.hintButton, challenge.hintsRemaining <= 0 && styles.buttonDisabled]}
              onPress={handleHint}
              disabled={challenge.hintsRemaining <= 0}
              accessibilityRole="button"
              accessibilityLabel={t('scrambleQuest:hintButton')}
            >
              <Text style={styles.hintButtonText}>
                {challenge.hintsRemaining > 0
                  ? `${t('scrambleQuest:hintButton')} (${t('scrambleQuest:hintsRemainingLabel', { count: challenge.hintsRemaining })})`
                  : t('scrambleQuest:noHintsRemaining')}
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
    deferredRecap: { maxWidth: 360 },
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
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderWidth: 1,
      borderColor: colors.glyph,
    },
    streakPillText: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
    puzzleCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      overflow: 'hidden',
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.35,
      shadowRadius: 18,
      elevation: 8,
    },
    puzzleCardAccentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 5 },
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
    definition: {
      color: colors.glyph,
      fontSize: typography.scale.sm,
      fontStyle: 'italic',
      textAlign: 'center',
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
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
      shadowColor: colors.arcane,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 14,
      elevation: 4,
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    hintButton: {
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.glyph,
    },
    hintButtonText: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
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
