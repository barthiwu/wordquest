import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
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

/** Seconds remaining at or below which the timer ring turns urgent
 * (danger red, pulsing glow, a short vibration each second) — "Bold
 * Modern" design canvas review, Sept 2026 (Barth: keep E's overall look,
 * D's gold hint-button outline, and the timer needs to visibly + audibly
 * warn under 10s). True audio "beeping" needs expo-av, a new native
 * dependency that would need a rebuild — flagged to Barth rather than
 * added mid-Xcode-signing-session; Vibration ships now with zero new
 * native deps and no rebuild. */
const URGENT_THRESHOLD_SECONDS = 10;
const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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
  const [showSynonyms, setShowSynonyms] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const autoSubmittedRef = useRef(false);
  const lastVibratedSecondRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setPhase('loading');
    try {
      const view = await startScrambleQuest(accessToken);
      setChallenge(view);
      setAnswer('');
      setShowSynonyms(false);
      autoSubmittedRef.current = false;
      lastVibratedSecondRef.current = null;
      setPhase('active');
    } catch {
      setPhase('error');
    }
  }, [accessToken]);

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
      if (secondsLeft <= URGENT_THRESHOLD_SECONDS && lastVibratedSecondRef.current !== secondsLeft) {
        lastVibratedSecondRef.current = secondsLeft;
        Vibration.vibrate(80);
      }
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

        <PuzzleTimerRing
          remainingSeconds={remainingSeconds}
          timeLimitSeconds={challenge.timeLimitSeconds}
          colors={colors}
          styles={styles}
        />

        <View style={styles.puzzleCard}>
          <LinearGradient
            colors={[colors.glyph, colors.arcane]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.puzzleCardAccentBar}
          />
          <Text style={styles.scrambledLetters}>
            {challenge.scrambledLetters.toUpperCase().split('').join(' ')}
          </Text>
          {challenge.revealedLetters.length > 0 && <Text style={styles.skeleton}>{skeleton}</Text>}

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

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * "Bold Modern" design canvas review, Sept 2026 (Barth: "the flat plain
 * timer text doesn't feel like a game"). Same glowing-ring pattern as
 * Boss Battle's SiegeRing, adapted for a race against a 30s word timer
 * instead of a countdown-to-start: the ring drains as a real fraction of
 * timeLimitSeconds — full ring the moment a fresh word starts, down to a
 * sliver right before the deadline (Barth, Sept 2026: "when it is on
 * 1sec, the ring itself should also show it that it is a tiny dot
 * left") — and only turns danger-red + starts pulsing once inside the
 * urgent window, so a calm ring reads as "plenty of time left" the rest
 * of the run.
 */
function PuzzleTimerRing({
  remainingSeconds,
  timeLimitSeconds,
  colors,
  styles,
}: {
  remainingSeconds: number;
  timeLimitSeconds: number;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const urgent = remainingSeconds <= URGENT_THRESHOLD_SECONDS;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!urgent) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [urgent, pulse]);

  const progress = timeLimitSeconds > 0 ? Math.min(1, Math.max(0, remainingSeconds / timeLimitSeconds)) : 0;
  const dashoffset = RING_CIRCUMFERENCE * (1 - progress);
  const ringColor = urgent ? colors.danger : colors.arcaneSoft;

  return (
    <View style={styles.ringWrap}>
      <Svg width={116} height={116} viewBox="0 0 116 116" style={styles.ringSvg}>
        <Circle cx={58} cy={58} r={RING_RADIUS} fill="none" stroke={colors.border} strokeWidth={8} />
        <AnimatedCircle
          cx={58}
          cy={58}
          r={RING_RADIUS}
          fill="none"
          stroke={ringColor}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashoffset}
          opacity={pulse}
          rotation={-90}
          origin="58, 58"
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>{remainingSeconds}s</Text>
      </View>
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
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderWidth: 1,
      borderColor: colors.glyph,
    },
    streakPillText: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
    ringWrap: {
      alignSelf: 'center',
      width: 116,
      height: 116,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringSvg: { position: 'absolute' },
    ringCenter: { alignItems: 'center', justifyContent: 'center' },
    timerText: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    timerTextUrgent: { color: colors.danger },
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
