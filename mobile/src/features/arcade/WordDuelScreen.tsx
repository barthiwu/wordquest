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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  getWordDuelState,
  joinWordDuelQueue,
  submitWordDuelAnswer,
  type WordDuelStateView,
} from '@/services/wordDuel';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { CountdownRing } from '@/components/CountdownRing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'WordDuel'>;

type Phase = 'loading' | 'waiting' | 'active' | 'no-opponent' | 'complete' | 'error';

/** How often to poll the live match state (spec §6/§11's deliberately
 * chosen REST + client-polling transport, not a WebSocket gateway —
 * see WordDuelService's doc comment). Short enough that a newly
 * revealed clue (CLUE_INTERVAL_SECONDS = 8s server-side) and an
 * opponent joining/finishing both feel prompt; well under the
 * controller's 120-req/min budget on the state endpoint. */
const POLL_INTERVAL_MS = 2000;
/** How long a correct/incorrect flash stays up before clearing itself —
 * a duel doesn't pause for the player to hit "Continue" the way
 * ScrambleQuest does, since the opponent isn't waiting either. */
const FEEDBACK_DISPLAY_MS = 1400;
/** Mirrors backend WORD_DUEL_CONFIG.MATCH_DURATION_MINUTES -- the match
 * clock only ever gives this screen an absolute deadline (matchEndsAt),
 * not a total duration or start time, so the countdown ring's "how much
 * of the match is left" fraction needs its own denominator. If the API
 * ever adds a match-duration/started-at field, prefer that over this. */
const MATCH_DURATION_SECONDS = 5 * 60;
/** Same "Bold Modern" design-canvas language ScrambleQuest/Complete It
 * use -- kept at 30s here (not the usual 10s) since a 5-minute match
 * clock needs a longer runway to feel like a real warning. */
const URGENT_THRESHOLD_SECONDS = 30;

interface Feedback {
  isCorrect: boolean;
  correctAnswer: string;
  xpAwarded: number;
}

/**
 * Word Duel (spec §6) — a two-player real-time race. Unlike
 * ScrambleQuest/Complete It there's no per-word timer or hint button:
 * clues reveal automatically as time passes (server-computed), and the
 * only clock that matters is the match-wide countdown. This screen's
 * countdown and clue count are refreshed by polling, not by a
 * WebSocket push — see POLL_INTERVAL_MS above.
 */
export function WordDuelScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['wordDuel', 'arcade']);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [phase, setPhase] = useState<Phase>('loading');
  const [state, setState] = useState<WordDuelStateView | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyState = useCallback((view: WordDuelStateView) => {
    setState(view);
    if (view.status === 'WAITING') setPhase('waiting');
    else if (view.status === 'ACTIVE') setPhase('active');
    else if (view.status === 'COMPLETED') setPhase('complete');
    else setPhase('no-opponent'); // ABANDONED — this player's own stale queue entry
  }, []);

  const join = useCallback(async () => {
    if (!accessToken) return;
    setPhase('loading');
    setFeedback(null);
    setAnswer('');
    try {
      const view = await joinWordDuelQueue(accessToken);
      applyState(view);
    } catch {
      setPhase('error');
    }
  }, [accessToken, applyState]);

  useEffect(() => {
    join();
  }, [join]);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  // Polls the live match while there's anything worth watching for —
  // an opponent joining, clues revealing, or the match ending. Silent
  // on a failed tick (a transient network hiccup shouldn't flash an
  // error over an otherwise-fine match).
  useEffect(() => {
    if (!accessToken || !state || (phase !== 'waiting' && phase !== 'active')) return undefined;
    const matchId = state.matchId;
    const interval = setInterval(async () => {
      try {
        const fresh = await getWordDuelState(accessToken, matchId);
        applyState(fresh);
      } catch {
        // transient — next tick will retry
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [accessToken, state, phase, applyState]);

  // Cosmetic match countdown, ticked from the server-issued matchEndsAt.
  useEffect(() => {
    if (phase !== 'active' || !state?.matchEndsAt) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [phase, state?.matchEndsAt]);

  const handleSubmit = async () => {
    if (!accessToken || !state || submitting || !answer.trim()) return;
    setSubmitting(true);
    const matchId = state.matchId;
    const submittedAnswer = answer;
    try {
      const result = await submitWordDuelAnswer(accessToken, matchId, submittedAnswer);
      applyState(result.state);
      setAnswer('');
      setFeedback({
        isCorrect: result.isCorrect,
        correctAnswer: result.correctAnswer,
        xpAwarded: result.xpAwarded,
      });
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), FEEDBACK_DISPLAY_MS);
    } catch (err) {
      // A raced/duplicate submission (409, two taps or a slow retry) or
      // an answer that arrived just as the match ended (400) both just
      // mean the server has moved on — refresh state rather than
      // showing a hard error over what's really a timing race.
      if (err instanceof ApiError && (err.status === 409 || err.status === 400)) {
        try {
          const fresh = await getWordDuelState(accessToken, matchId);
          applyState(fresh);
        } catch {
          setPhase('error');
        }
      } else {
        setPhase('error');
      }
    } finally {
      setSubmitting(false);
    }
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

  if (phase === 'waiting') {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <ActivityIndicator color={colors.arcaneSoft} />
        <Text style={styles.title}>{t('waitingTitle')}</Text>
        <Text style={styles.subtitle}>{t('waitingSubtitle')}</Text>
      </View>
    );
  }

  if (phase === 'no-opponent') {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>{t('noOpponentTitle')}</Text>
        <Text style={styles.subtitle}>{t('noOpponentSubtitle')}</Text>
        <Pressable
          style={styles.button}
          onPress={join}
          accessibilityRole="button"
          accessibilityLabel={t('tryAgain')}
        >
          <Text style={styles.buttonText}>{t('tryAgain')}</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('arcade:backToPlay')}
        >
          <Text style={styles.secondaryButtonText}>{t('arcade:backToPlay')}</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'complete' && state?.result) {
    const { result } = state;
    const outcomeTitle =
      result.winnerId === null
        ? t('resultDrawTitle')
        : result.youWon
          ? t('resultWinTitle')
          : t('resultLoseTitle');
    return (
      <ScrollView style={styles.flexFill} contentContainerStyle={styles.centeredScrollContent}>
        <Text style={styles.title}>{outcomeTitle}</Text>
        <Text style={styles.summaryLine}>
          {t('resultYouSummary', { correct: state.correctCount, xp: state.totalXp })}
        </Text>
        <Text style={styles.summaryLine}>
          {t('resultOpponentSummary', {
            correct: state.opponent?.correctCount ?? 0,
            xp: state.opponent?.totalXp ?? 0,
          })}
        </Text>
        {result.tieBreakReason && (
          <Text style={styles.tiebreakNote}>{t('resultTiebreakNote')}</Text>
        )}
        <Pressable
          style={styles.button}
          onPress={join}
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

  if (!state) return null;

  const remainingSeconds = state.matchEndsAt
    ? Math.max(0, Math.ceil((new Date(state.matchEndsAt).getTime() - now) / 1000))
    : 0;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <View style={styles.flexFill}>
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton onPress={() => navigation.goBack()} />

        {state.matchEndsAt && (
          <>
            <Text style={styles.timerLabel}>{t('matchTimeLabel')}</Text>
            <CountdownRing
              remainingSeconds={remainingSeconds}
              totalSeconds={MATCH_DURATION_SECONDS}
              colors={colors}
              urgentThresholdSeconds={URGENT_THRESHOLD_SECONDS}
              label={`${minutes}:${String(seconds).padStart(2, '0')}`}
            />
          </>
        )}

        <View style={styles.scoreRow}>
          <View style={[styles.scoreCard, styles.scoreCardSelf]}>
            <Text style={styles.scoreLabel}>{t('youLabel')}</Text>
            <Text style={styles.scoreValue}>
              {t('correctCountLabel', { count: state.correctCount })}
            </Text>
            <Text style={styles.scoreXp}>{t('xpLabel', { xp: state.totalXp })}</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>{t('opponentLabel')}</Text>
            <Text style={styles.scoreValue}>
              {t('correctCountLabel', { count: state.opponent?.correctCount ?? 0 })}
            </Text>
            <Text style={styles.scoreXp}>{t('xpLabel', { xp: state.opponent?.totalXp ?? 0 })}</Text>
          </View>
        </View>

        {state.current ? (
          <>
            <View style={styles.puzzleCard}>
              <LinearGradient
                colors={[colors.glyph, colors.arcane]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.puzzleCardAccentBar}
              />
              <Text style={styles.displayHint}>{state.current.displayHint.toUpperCase()}</Text>
              <Text style={styles.clueProgress}>
                {t('clueProgressLabel', {
                  revealed: state.current.cluesRevealed,
                  max: state.current.maxClues,
                })}
              </Text>
            </View>

            <TextInput
              style={styles.input}
              value={answer}
              onChangeText={setAnswer}
              placeholder={t('answerPlaceholder')}
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              accessibilityLabel={t('yourAnswerLabel')}
              onSubmitEditing={handleSubmit}
            />
            <Pressable
              style={[styles.button, (!answer.trim() || submitting) && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={!answer.trim() || submitting}
              accessibilityRole="button"
              accessibilityLabel={t('submit')}
            >
              {submitting ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <Text style={styles.buttonText}>{t('submit')}</Text>
              )}
            </Pressable>

            {feedback && (
              <View style={styles.feedbackBar}>
                <Text
                  style={[
                    styles.feedbackText,
                    { color: feedback.isCorrect ? colors.success : colors.danger },
                  ]}
                >
                  {feedback.isCorrect
                    ? t('correctFeedback', { xp: feedback.xpAwarded })
                    : t('incorrectFeedback', { answer: feedback.correctAnswer })}
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.waitingForOpponentCard}>
            <ActivityIndicator color={colors.arcaneSoft} />
            <Text style={styles.title}>{t('waitingForOpponentTitle')}</Text>
            <Text style={styles.subtitle}>{t('waitingForOpponentSubtitle')}</Text>
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
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    summaryLine: { color: colors.ink, fontSize: typography.scale.md, textAlign: 'center' },
    tiebreakNote: { color: colors.inkMuted, fontSize: typography.scale.xs, textAlign: 'center' },
    timerLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      textTransform: 'uppercase',
      fontWeight: '700',
      textAlign: 'center',
    },
    scoreRow: { flexDirection: 'row', gap: spacing.md },
    scoreCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      alignItems: 'center',
      gap: 2,
    },
    // The player's own score card only -- same gold-outline language as
    // the streak pill in ScrambleQuest/Complete It, so "you" is visually
    // distinct from the opponent's card at a glance.
    scoreCardSelf: { borderColor: colors.glyph },
    scoreLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    scoreValue: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    scoreXp: { color: colors.glyph, fontSize: typography.scale.xs },
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
    displayHint: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: '700',
      letterSpacing: 4,
    },
    clueProgress: { color: colors.inkMuted, fontSize: typography.scale.xs },
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
      paddingHorizontal: spacing.xl,
    },
    secondaryButtonText: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
      fontWeight: '600',
    },
    feedbackBar: { alignItems: 'center' },
    feedbackText: { fontSize: typography.scale.md, fontWeight: '700' },
    waitingForOpponentCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      alignItems: 'center',
      gap: spacing.sm,
    },
  });
}
