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
import { Ionicons } from '@expo/vector-icons';
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
import { AliDeferredRecap } from '@/components/AliDeferredRecap';
import type { AliExpressionCue } from '@/services/aliExpression';
import { AliBubble } from '@/components/AliBubble';
import { ProtoGameHeader } from '@/features/proto/ProtoGameHeader';
import { VersusBar } from '@/components/VersusBar';
import { VersusResultCard } from '@/components/VersusResultCard';
import { AliStreakPopout } from '@/components/AliStreakPopout';
import { ArcadeHeroResults } from '@/components/ArcadeHeroResults';
import { BackButton } from '@/components/BackButton';
import { CountdownRing } from '@/components/CountdownRing';
import { LetterBoxInput } from '@/components/LetterBoxInput';
import { trackEvent } from '@/services/analyticsClient';
import { ApiError } from '@/services/apiClient';
import { isPlayLimitError } from '@/services/arcadePlays';
import { useArcadePlaysStore } from '@/state/arcadePlaysStore';
import { ArcadeLimitReached } from '@/components/ArcadeLimitReached';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ScrambleQuest'>;

type Phase = 'loading' | 'active' | 'submitting' | 'feedback' | 'complete' | 'error';

/** Seconds remaining at or below which the timer ring turns urgent
 * (danger red, pulsing glow, a short vibration each second) — "Bold
 * Modern" design canvas review, Sept 2026 (Barth: keep E's overall look,
 * D's gold hint-button outline, and the timer needs to visibly + audibly
 * warn under 10s). True audio "beeping" needs expo-av, a new native
 * dependency that would need a rebuild — flagged to Barth rather than
 * added mid-Xcode-signing-session; Vibration ships now with zero new
 * native deps and no rebuild. */
const URGENT_THRESHOLD_SECONDS = 10;

/**
 * Reconstructs the full word from the player's typed characters (which
 * only cover the still-editable, non-hint-revealed positions -- see
 * LetterBoxInput's `revealed` prop) plus the hint-revealed letters, so
 * the server always receives a complete answer of the right length.
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
 * ScrambleQuest (spec §5) — one word at a time, 30s server-authoritative
 * timer, up to 3 letter-reveal hints, immediate advance on a correct
 * answer. The local countdown here is purely cosmetic: the server
 * decides timeout from its own recorded start time (ScrambleQuestService
 * §11), so a submission that lands right as this screen's clock hits
 * zero is judged by the server's clock, not this one's.
 */
export function ScrambleQuestScreen({ navigation, route }: Props) {
  const versusMatchId = route.params?.versusMatchId;
  // Set when this play is part of a Group Play round.
  const groupId = route.params?.groupId;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['scrambleQuest', 'arcade']);
  const { t: tp } = useTranslation('proto');
  const accessToken = useAuthStore((s) => s.accessToken);

  const [phase, setPhase] = useState<Phase>('loading');
  // Set when the server refuses the start because today's plays are used up.
  const [limitHit, setLimitHit] = useState(false);
  const [challenge, setChallenge] = useState<ScrambleQuestChallenge | null>(null);
  const [answer, setAnswer] = useState('');
  const answerRef = useRef('');
  answerRef.current = answer;
  const submitRef = useRef<(typed: string) => void>(() => undefined);
  const [feedback, setFeedback] = useState<ScrambleQuestAnswerResult | null>(null);
  const [showMeaning, setShowMeaning] = useState(false);
  const [showSynonyms, setShowSynonyms] = useState(false);
  const [displayedLetters, setDisplayedLetters] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const autoSubmittedRef = useRef(false);
  const lastVibratedSecondRef = useRef<number | null>(null);
  const [aliBubble, setAliBubble] = useState<{
    id: number;
    message: string;
    expression: AliExpressionCue;
  } | null>(null);
  const aliBubbleCounter = useRef(0);

  // Telemetry spec §11 (generic Arcade events -- shared with CompleteIt,
  // distinguished by the `game` property). completedRef guards
  // ARCADE_SESSION_ABANDONED on unmount, same mount/unmount-ref pattern
  // as WordDuelScreen's DUEL_ABANDONED / DailyQuestScreen's
  // QUEST_ABANDONED.
  const completedRef = useRef(false);
  useEffect(() => {
    return () => {
      if (!completedRef.current) {
        trackEvent('ARCADE_SESSION_ABANDONED', { game: 'SCRAMBLE_QUEST' });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setPhase('loading');
    try {
      const view = await startScrambleQuest(accessToken, versusMatchId, groupId);
      useArcadePlaysStore.getState().applyNotice(view.playLimit);
      trackEvent('ARCADE_SESSION_STARTED', { game: 'SCRAMBLE_QUEST' });
      setChallenge(view);
      setDisplayedLetters(view.scrambledLetters);
      setAnswer('');
      setShowSynonyms(false);
      autoSubmittedRef.current = false;
      lastVibratedSecondRef.current = null;
      setPhase('active');
    } catch (err) {
      if (isPlayLimitError(err)) {
        useArcadePlaysStore.getState().markLocked('SCRAMBLE_QUEST');
        setLimitHit(true);
      }
      setPhase('error');
    }
  }, [accessToken, versusMatchId, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  // Cosmetic-only countdown, ticked from the server-issued deadlineAt.
  // Also fires one short vibration per second once inside the urgent
  // window — lastVibratedSecondRef keeps that to once per whole second
  // even though this tick runs every 250ms.
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
    setShowMeaning(false);
    const fullAnswer = mergeRevealedAnswer(
      typedAnswer,
      challenge.revealedLetters,
      challenge.wordLength,
    );
    try {
      const result = await submitScrambleAnswer(accessToken, challenge.sessionId, fullAnswer);
      trackEvent('ARCADE_ANSWER_SUBMITTED', {
        game: 'SCRAMBLE_QUEST',
        isCorrect: result.isCorrect,
      });
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
        game: 'SCRAMBLE_QUEST',
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

  const handleShuffle = () => {
    setDisplayedLetters((current) => {
      const shuffleOnce = () => {
        const letters = current.split('');
        for (let i = letters.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [letters[i], letters[j]] = [letters[j], letters[i]];
        }
        return letters.join('');
      };
      let next = shuffleOnce();
      if (next === current && current.length > 1) next = shuffleOnce();
      return next;
    });
  };

  const handleContinue = () => {
    if (!feedback) return;
    if (feedback.sessionComplete || !feedback.nextChallenge) {
      completedRef.current = true;
      trackEvent('ARCADE_SESSION_COMPLETED', { game: 'SCRAMBLE_QUEST' });
      // A head-to-head play counts toward the daily cap only once finished.
      useArcadePlaysStore.getState().applyNotice(feedback.playLimit);
      setPhase('complete');
      return;
    }
    setChallenge(feedback.nextChallenge);
    setDisplayedLetters(feedback.nextChallenge.scrambledLetters);
    setFeedback(null);
    setAnswer('');
    setShowSynonyms(false);
    autoSubmittedRef.current = false;
    lastVibratedSecondRef.current = null;
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
    return <ArcadeLimitReached game="SCRAMBLE_QUEST" onBack={() => navigation.goBack()} />;
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
        <ArcadeHeroResults
          colors={colors}
          title={t('sessionCompleteTitle')}
          subtitle={t('sessionCorrectSummary', {
            correct: feedback.correctCount,
            total: feedback.wordsTotal,
          })}
          correctCount={feedback.correctCount}
          totalCount={feedback.wordsTotal}
          stats={[
            { icon: 'flash', text: t('sessionXpEarned', { xp: feedback.totalXpAwarded }) },
            { icon: 'flame', text: t('sessionLongestStreak', { streak: feedback.longestStreak }) },
          ]}
          primaryLabel={
            groupId
              ? t('arcade:group.play.backToGroup')
              : versusMatchId
                ? t('arcade:versus.result.rematch')
                : t('playAgain')
          }
          onPrimary={
            groupId
              ? () => navigation.replace('ArcadeGroup', { groupId })
              : versusMatchId
                ? () => navigation.replace('ArcadeVersus', { game: 'SCRAMBLE_QUEST' })
                : load
          }
          secondaryLabel={t('arcade:backToPlay')}
          onSecondary={() => navigation.goBack()}
        />
        {versusMatchId ? <VersusResultCard matchId={versusMatchId} /> : null}
        {groupId ? <Text style={styles.groupNote}>{t('arcade:group.play.complete')}</Text> : null}
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
        <ProtoGameHeader line={tp('gameScramble')} />
        {versusMatchId ? <VersusBar matchId={versusMatchId} /> : null}

        <View style={styles.headerRow}>
          <Text style={styles.progressLabel}>
            {t('progressLabel', { current: challenge.wordIndex + 1, total: challenge.wordsTotal })}
          </Text>
          <AliStreakPopout
            pillStyle={styles.streakPill}
            textStyle={styles.streakPillText}
            label={`${t('streakLabel')} ${challenge.currentStreak}`}
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
          <View style={styles.scrambledRow}>
            <Text style={styles.scrambledLetters}>
              {displayedLetters.toUpperCase().split('').join(' ')}
            </Text>
            <Pressable
              style={styles.shuffleButton}
              onPress={handleShuffle}
              accessibilityRole="button"
              accessibilityLabel={t('shuffleButton')}
            >
              <Ionicons name="shuffle-outline" size={16} color={colors.glyph} />
            </Pressable>
          </View>

          <Text style={styles.definitionText}>
            {t('hintFormat', { definition: challenge.definition })}
          </Text>

          {/* Optional, player-initiated — revealing it never touches XP or the
              server-tracked hint count, unlike the letter-reveal Hint button
              below (Barth, Sept 2026: "shouldn't impact their XP"). */}
          <Pressable
            style={styles.synonymsButton}
            onPress={() => setShowSynonyms((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={t('synonymsButton')}
          >
            <Text style={styles.synonymsButtonText}>{t('synonymsButton')}</Text>
          </Pressable>
          {showSynonyms && challenge.synonyms.length > 0 && (
            <Text style={styles.synonymsText}>
              {t('synonymsListLabel', { list: challenge.synonyms.join(', ') })}
            </Text>
          )}
        </View>

        {phase === 'active' && (
          <>
            <LetterBoxInput
              value={answer}
              onChangeText={setAnswer}
              length={challenge.wordLength}
              colors={colors}
              accessibilityLabel={t('yourAnswerLabel')}
              onSubmitEditing={() => handleSubmit(answer)}
              revealed={challenge.revealedLetters}
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
    groupNote: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
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
    puzzleCardAccentBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 5,
    },
    scrambledRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    scrambledLetters: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: '700',
      letterSpacing: 4,
    },
    shuffleButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.glyph,
      alignItems: 'center',
      justifyContent: 'center',
    },
    definitionText: {
      color: colors.glyph,
      fontSize: typography.scale.sm,
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    synonymsButton: {
      borderRadius: radius.pill,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.glyph,
      marginTop: spacing.xs,
    },
    synonymsButtonText: { color: colors.glyph, fontSize: typography.scale.xs, fontWeight: '700' },
    synonymsText: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      textAlign: 'center',
      paddingHorizontal: spacing.sm,
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
      borderColor: colors.glyph,
    },
    hintButtonText: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
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
