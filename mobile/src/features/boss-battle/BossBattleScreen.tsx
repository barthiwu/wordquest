import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  getBattleLeaderboard,
  getUpcomingBattle,
  joinBattle,
  submitBattleAnswer,
  type BattleChallengeView,
  type UpcomingBattle,
} from '@/services/bossBattle';
import { getMyPassport, type PassportBossBattleResult } from '@/services/passport';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { ArcadeHeroResults } from '@/components/ArcadeHeroResults';
import { BackButton } from '@/components/BackButton';
import type { AliExpressionCue } from '@/services/aliExpression';
import { AliBubble } from '@/components/AliBubble';
import { LetterBoxInput } from '@/components/LetterBoxInput';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'BossBattle'>;

type Phase =
  'loading' | 'upcoming' | 'joining' | 'waitingRoom' | 'active' | 'feedback' | 'ended' | 'error';

// How long the friendly "you're in, get ready" transition holds before
// revealing the first challenge -- Barth, Sept 2026: "it should have a
// bit of waiting room also". Joining itself stays fully asynchronous
// (each player gets their own 30-minute clock from the moment they
// join) -- this is UI polish on that instant join, not a real lobby, so
// it's deliberately short.
const WAITING_ROOM_MS = 1800;

interface Feedback {
  isCorrect: boolean;
  correctAnswer: string;
  exampleSentence: string;
  xpAwarded: number;
  aliQuickReaction: string | null;
}

// Battles run weekly (backend battle-schedule.ts: Sundays 17:00-18:00
// UTC) -- used only to turn the real scheduledStartUtc into a 0-1
// "how close is it" fraction for the countdown ring's fill, never to
// decide anything about the battle itself.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RING_RADIUS = 90;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Screens 33-38 of the UI/UX Screen Bible, condensed into one hub —
 * "Basic Boss Battle" from the MVP list. Battle/group status is always
 * re-derived server-side (see boss-battle.service.ts's doc comment) —
 * this screen never assumes SCHEDULED/LIVE/COMPLETED stays true, it
 * just reflects whatever the server said as of the last call.
 */
export function BossBattleScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['bossBattle', 'scrambleQuest']);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState(t('genericError'));
  const [upcoming, setUpcoming] = useState<UpcomingBattle | null>(null);
  const [challenge, setChallenge] = useState<BattleChallengeView | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [aliBubble, setAliBubble] = useState<{
    id: number;
    message: string;
    expression: AliExpressionCue;
  } | null>(null);
  const aliBubbleCounter = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const waitingRoomTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (waitingRoomTimeout.current) clearTimeout(waitingRoomTimeout.current);
    };
  }, []);
  const [history, setHistory] = useState<PassportBossBattleResult[]>([]);
  // Fetched once the battle ends, for the Hero Ring results screen —
  // Boss Battle's own submit/feedback loop only ever tracks the current
  // question's xpAwarded, never a running correct/incorrect tally, so
  // the group leaderboard (which needs this shape anyway) is reused as
  // the source for "my" final line (Barth, Sept 2026: Hero Ring
  // extended to every arcade completion screen ahead of the separate
  // group-leaderboard reveal).
  const [myBattleResult, setMyBattleResult] = useState<{
    correct: number;
    incorrect: number;
    xp: number;
  } | null>(null);

  const load = useCallback(
    (showSpinner = true) => {
      if (!accessToken) return;
      if (showSpinner) setPhase('loading');
      getUpcomingBattle(accessToken)
        .then((view) => {
          setUpcoming(view);
          setPhase(view.status === 'COMPLETED' ? 'ended' : 'upcoming');
        })
        .catch(() => setPhase('error'));
    },
    [accessToken],
  );

  useFocusEffect(useCallback(() => load(), [load]));

  useEffect(() => {
    if (phase !== 'ended' || !accessToken) return;
    getBattleLeaderboard(accessToken)
      .then((view) => {
        const mine = view.entries.find((e) => e.isYou);
        if (mine) {
          setMyBattleResult({
            correct: mine.correctAnswers,
            incorrect: mine.incorrectAnswers,
            xp: mine.battleXp,
          });
        }
      })
      .catch(() => {});
  }, [phase, accessToken]);

  // Passport already computes the full ranked history (weekId,
  // placement, isWinner, battleXp) for the profile screen -- reused
  // here rather than standing up a second endpoint for the same rows.
  useFocusEffect(
    useCallback(() => {
      if (!accessToken) return;
      getMyPassport(accessToken)
        .then((p) => setHistory(p.bossBattleHistory))
        .catch(() => {});
    }, [accessToken]),
  );

  // While waiting for the battle to open, poll quietly (no spinner) so
  // SCHEDULED -> LIVE shows up on its own — the player shouldn't have to
  // leave and come back to see "Join battle" appear.
  useFocusEffect(
    useCallback(() => {
      if (phase !== 'upcoming' || upcoming?.status === 'LIVE') return undefined;
      const interval = setInterval(() => load(false), 15000);
      return () => clearInterval(interval);
    }, [phase, upcoming?.status, load]),
  );

  // Drives the "Starts in..." countdown on the upcoming-battle card. A
  // separate one-second tick from the 15s status poll above -- that one
  // exists to catch SCHEDULED -> LIVE server-side, this one just keeps
  // the on-screen clock moving smoothly in between polls.
  useEffect(() => {
    if (phase !== 'upcoming' || upcoming?.status === 'LIVE') return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [phase, upcoming?.status]);

  const onJoin = async () => {
    if (!accessToken) return;
    setPhase('joining');
    try {
      const view = await joinBattle(accessToken);
      setChallenge(view);
      if (view.battleEnded) {
        // Resumed players whose window/guesses were already exhausted
        // since they last had the app open -- same "ended" destination
        // onSubmit already uses for a mid-play ending, no waiting room.
        setPhase('ended');
        return;
      }
      // A truly fresh join (nothing answered yet) gets a brief, friendly
      // "you're in" moment before the first challenge appears. A
      // RESUMED battle (app reopened mid-play) skips straight to
      // 'active' -- questionsAnswered === 0 is a reliable signal here:
      // the backend only ever returns that on a brand-new player row
      // (see joinBattle/claimGroupSlot in boss-battle.service.ts), never
      // on a resume, which always carries the player's real progress.
      if (view.questionsAnswered === 0) {
        setPhase('waitingRoom');
        waitingRoomTimeout.current = setTimeout(() => {
          setPhase('active');
        }, WAITING_ROOM_MS);
      } else {
        setPhase('active');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setErrorMessage(err.message);
      setPhase('error');
    }
  };

  const onSubmit = async () => {
    if (!accessToken || !answer.trim()) return;
    try {
      const result = await submitBattleAnswer(accessToken, answer.trim());
      setFeedback({
        isCorrect: result.isCorrect,
        correctAnswer: result.correctAnswer,
        exampleSentence: result.exampleSentence,
        xpAwarded: result.xpAwarded,
        aliQuickReaction: result.aliQuickReaction,
      });
      if (result.aliQuickReaction && result.aliQuickExpression) {
        aliBubbleCounter.current += 1;
        setAliBubble({
          id: aliBubbleCounter.current,
          message: result.aliQuickReaction,
          expression: result.aliQuickExpression,
        });
      }
      setChallenge(result.nextChallenge);
      setAnswer('');
      setPhase(result.battleEnded ? 'ended' : 'feedback');
    } catch {
      setPhase('error');
    }
  };

  const onContinue = () => {
    setFeedback(null);
    setPhase('active');
  };

  if (phase === 'loading' || phase === 'joining') {
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
        <Text style={styles.error}>{errorMessage}</Text>
      </View>
    );
  }

  if (phase === 'waitingRoom') {
    return <WaitingRoom colors={colors} styles={styles} t={t} />;
  }

  if (phase === 'upcoming' && upcoming) {
    const startMs = new Date(upcoming.scheduledStartUtc).getTime();
    const remainingMs = startMs - now;
    const progress = 1 - Math.min(1, Math.max(0, remainingMs) / WEEK_MS);

    return (
      <ScrollView style={styles.flexFill} contentContainerStyle={styles.siegeContent}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={styles.siegeHeader}>
          <Text style={styles.siegeKicker}>{t('kicker')}</Text>
          <Text style={styles.siegeSubtitle}>
            {upcoming.status === 'LIVE'
              ? t('liveNow')
              : t('startsAt', { date: new Date(upcoming.scheduledStartUtc).toLocaleString() })}
          </Text>
        </View>

        {upcoming.status !== 'LIVE' && (
          <SiegeRing
            remainingMs={remainingMs}
            progress={progress}
            colors={colors}
            styles={styles}
            t={t}
          />
        )}

        {upcoming.status !== 'LIVE' && (
          <Pressable
            style={styles.waitCta}
            onPress={() => navigation.navigate('WordMastery')}
            accessibilityRole="button"
            accessibilityLabel={t('waitCtaLabel')}
          >
            <View style={styles.waitCtaIconWrap}>
              <Ionicons name="book-outline" size={16} color={colors.glyph} />
            </View>
            <View style={styles.waitCtaTextCol}>
              <Text style={styles.waitCtaTitle}>{t('waitCtaTitle')}</Text>
              <Text style={styles.waitCtaSubtitle}>{t('waitCtaSubtitle')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.arcaneSoft} />
          </Pressable>
        )}

        {upcoming.status === 'LIVE' && (
          <Pressable
            style={styles.button}
            onPress={onJoin}
            accessibilityRole="button"
            accessibilityLabel={t('joinBattle')}
          >
            <Text style={styles.buttonText}>{t('joinBattle')}</Text>
          </Pressable>
        )}
        <HistorySection history={history} colors={colors} styles={styles} t={t} />
      </ScrollView>
    );
  }

  if (phase === 'ended') {
    return (
      <ScrollView style={styles.flexFill} contentContainerStyle={styles.centeredScrollContent}>
        {myBattleResult ? (
          <ArcadeHeroResults
            colors={colors}
            title={t('battleComplete')}
            subtitle={t('scrambleQuest:sessionCorrectSummary', {
              correct: myBattleResult.correct,
              total: myBattleResult.correct + myBattleResult.incorrect,
            })}
            correctCount={myBattleResult.correct}
            totalCount={myBattleResult.correct + myBattleResult.incorrect}
            stats={[
              {
                icon: 'flash',
                text: t('scrambleQuest:sessionXpEarned', { xp: myBattleResult.xp }),
              },
            ]}
            primaryLabel={t('seeLeaderboard')}
            onPrimary={() => navigation.navigate('BossBattleLeaderboard')}
          />
        ) : (
          <>
            <Text style={styles.title}>{t('battleComplete')}</Text>
            <ActivityIndicator color={colors.arcaneSoft} />
          </>
        )}
        <HistorySection history={history} colors={colors} styles={styles} t={t} />
      </ScrollView>
    );
  }

  if ((phase === 'active' || phase === 'feedback') && challenge) {
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
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>{t('progressLabel')}</Text>
            <Text style={styles.progressCount}>
              {t('progressCount', {
                answered: challenge.questionsAnswered,
                total: challenge.maxQuestions,
              })}
            </Text>
          </View>
          <View style={styles.clueCard}>
            <LinearGradient
              colors={[colors.glyph, colors.arcane]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.clueCardAccentBar}
            />
            <Text style={styles.partOfSpeech}>{challenge.partOfSpeech}</Text>
            <Text style={styles.definition}>{challenge.definition}</Text>
            <Text style={styles.pattern}>{challenge.displayPattern}</Text>
          </View>

          {phase === 'active' && (
            <>
              <LetterBoxInput
                value={answer}
                onChangeText={setAnswer}
                length={challenge.wordLength}
                colors={colors}
                accessibilityLabel={t('yourAnswerLabel')}
                onSubmitEditing={onSubmit}
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

          {phase === 'feedback' && feedback && (
            <View style={styles.feedbackBar}>
              <Text
                style={[
                  styles.feedbackText,
                  { color: feedback.isCorrect ? colors.success : colors.danger },
                ]}
              >
                {feedback.isCorrect
                  ? t('correctFeedback', { xp: feedback.xpAwarded })
                  : t('incorrectFeedback')}
              </Text>
              {!feedback.isCorrect && (
                <Text style={styles.revealText}>
                  {t('revealPrefix')}{' '}
                  <Text style={styles.revealWord}>{feedback.correctAnswer}</Text>
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
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return null;
}

/**
 * The brief "you're in, get ready" beat between tapping "Join battle"
 * and the first challenge appearing (Barth, Sept 2026: "it should have
 * a bit of waiting room also, so people join and they all proceed to
 * the game at once"). Joining stays fully asynchronous under the hood
 * (each player's own 30-minute clock starts the moment THEY join) --
 * this is purely a friendly transition, not a real lobby, so it reuses
 * this screen's own "Boss Battle" kicker styling and pulsing-glow
 * language (see SiegeRing below) rather than a synchronized wait.
 */
function WaitingRoom({
  colors,
  styles,
  t,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0.6,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.centered}>
      <Text style={styles.siegeKicker}>{t('kicker')}</Text>
      <Animated.View style={[styles.waitingRoomBadge, { opacity: pulse }]}>
        <Ionicons name="shield-checkmark" size={44} color={colors.glyph} />
      </Animated.View>
      <Text style={styles.title}>{t('waitingRoomTitle')}</Text>
      <Text style={styles.siegeSubtitle}>{t('waitingRoomSubtitle')}</Text>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * "Siege Countdown" direction (Design canvas review, Sept 2026 — "it
 * looks too flat for a game"): the plain "BATTLE OPENS IN" card becomes
 * a glowing charge-up ring. The fill fraction is derived from the real
 * scheduledStartUtc against the battle's known weekly cadence (see
 * WEEK_MS above) — nothing about the schedule itself is invented, this
 * only visualizes how much of the week has passed.
 */
function SiegeRing({
  remainingMs,
  progress,
  colors,
  styles,
  t,
}: {
  remainingMs: number;
  progress: number;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const parts = formatCountdownParts(remainingMs);
  const dashoffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <View style={styles.ringWrap}>
      <Svg width={210} height={210} viewBox="0 0 210 210" style={styles.ringSvg}>
        <Circle
          cx={105}
          cy={105}
          r={RING_RADIUS}
          fill="none"
          stroke={colors.border}
          strokeWidth={10}
        />
        <AnimatedCircle
          cx={105}
          cy={105}
          r={RING_RADIUS}
          fill="none"
          stroke={colors.arcane}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashoffset}
          opacity={pulse}
          rotation={-90}
          origin="105, 105"
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringLabel}>
          {remainingMs > 0 ? t('battleOpensIn') : t('battleOpening')}
        </Text>
        <Text style={styles.ringBig}>{parts.big}</Text>
        {parts.small ? <Text style={styles.ringSmall}>{parts.small}</Text> : null}
      </View>
    </View>
  );
}

/**
 * "Let there be a history section where you can check your previous
 * plays and what position you got in those" -- renders under both the
 * upcoming and the just-ended views (not mid-battle, where it'd just
 * be clutter). Placement/XP per week already comes straight off
 * Passport's bossBattleHistory, so no new endpoint was needed.
 */
function HistorySection({
  history,
  colors,
  styles,
  t,
}: {
  history: PassportBossBattleResult[];
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <View style={styles.historySection}>
      <Ionicons
        name="shield-outline"
        size={22}
        color={colors.inkMuted}
        style={styles.historyIcon}
      />
      <Text style={styles.historyTitle}>{t('historyTitle')}</Text>
      {history.length === 0 ? (
        <Text style={styles.historyEmpty}>{t('historyEmpty')}</Text>
      ) : (
        <View style={styles.historyRows}>
          {history.map((h) => (
            <View key={h.weekId} style={styles.historyRow}>
              <Text style={styles.historyWeek}>{h.weekId}</Text>
              <Text style={[styles.historyPlacement, h.isWinner && styles.historyPlacementWinner]}>
                {t('placeLabel', { ordinal: ordinal(h.placement) })}
                {h.isWinner ? ' \u{1F3C6}' : ''}
              </Text>
              <Text style={styles.historyXp}>{t('xpValue', { xp: h.battleXp })}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

/**
 * Splits the remaining time into a two-line "3d 07h" / "54m 58s" pair
 * for the countdown ring — same zero-dropping spirit as the old single-
 * line formatCountdown (a battle starting in 40 minutes reads as "40m"
 * / "12s", not "0d 00h 40m" / "12s"), just grouped for the ring's two
 * text sizes instead of one string.
 */
function formatCountdownParts(remainingMs: number): { big: string; small: string } {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  if (days > 0)
    return { big: `${days}d ${pad(hours)}h`, small: `${pad(minutes)}m ${pad(seconds)}s` };
  if (hours > 0) return { big: `${hours}h ${pad(minutes)}m`, small: `${pad(seconds)}s` };
  if (minutes > 0) return { big: `${minutes}m`, small: `${pad(seconds)}s` };
  return { big: `${seconds}s`, small: '' };
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    flexFill: { flex: 1 },
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.xl,
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
      paddingTop: topInset + spacing.xl,
      gap: spacing.md,
    },
    siegeContent: {
      flexGrow: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.lg,
      gap: spacing.lg,
    },
    siegeHeader: { alignItems: 'center', marginTop: spacing.sm },
    siegeKicker: {
      color: colors.glyph,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      letterSpacing: 2,
    },
    siegeSubtitle: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    ringWrap: { width: 210, height: 210, alignItems: 'center', justifyContent: 'center' },
    ringSvg: { position: 'absolute' },
    ringCenter: { alignItems: 'center', justifyContent: 'center' },
    ringLabel: {
      color: colors.inkMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.5,
      marginBottom: spacing.sm,
    },
    ringBig: { color: colors.ink, fontSize: 26, fontWeight: typography.display.weight },
    ringSmall: { color: colors.arcaneSoft, fontSize: 18, fontWeight: '700', marginTop: 2 },

    waitCta: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: 'rgba(139, 92, 246, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(139, 92, 246, 0.35)',
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    waitCtaIconWrap: {
      width: 34,
      height: 34,
      borderRadius: radius.md,
      backgroundColor: 'rgba(244, 197, 66, 0.16)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    waitCtaTextCol: { flex: 1 },
    waitCtaTitle: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    waitCtaSubtitle: { color: colors.inkMuted, fontSize: typography.scale.xs, marginTop: 2 },

    historySection: {
      width: '100%',
      marginTop: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
    },
    historyIcon: { marginBottom: spacing.xs },
    historyTitle: {
      color: colors.ink,
      fontSize: typography.scale.sm,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    historyEmpty: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    historyRows: { width: '100%', gap: spacing.sm },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    historyWeek: { color: colors.inkMuted, fontSize: typography.scale.xs, flex: 1 },
    historyPlacement: {
      color: colors.ink,
      fontSize: typography.scale.sm,
      fontWeight: '600',
      flex: 1,
      textAlign: 'center',
    },
    historyPlacementWinner: { color: colors.warning },
    historyXp: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      fontWeight: '700',
      flex: 1,
      textAlign: 'right',
    },
    error: { color: colors.danger, fontSize: typography.scale.md, textAlign: 'center' },
    title: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    progressRow: {
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
    progressCount: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.sm,
      fontWeight: '700',
    },
    clueCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      overflow: 'hidden',
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.xs,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.35,
      shadowRadius: 18,
      elevation: 8,
    },
    clueCardAccentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 5 },
    partOfSpeech: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    definition: { color: colors.ink, fontSize: typography.scale.md, textAlign: 'center' },
    pattern: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: '700',
      letterSpacing: 4,
      textAlign: 'center',
    },
    waitingRoomBadge: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: 'rgba(139, 92, 246, 0.16)',
      borderWidth: 1,
      borderColor: 'rgba(139, 92, 246, 0.4)',
      alignItems: 'center',
      justifyContent: 'center',
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
    feedbackBar: { gap: spacing.sm },
    feedbackText: { fontSize: typography.scale.md, fontWeight: '700' },
    revealText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    revealWord: { color: colors.ink, fontWeight: '700' },
  });
}
