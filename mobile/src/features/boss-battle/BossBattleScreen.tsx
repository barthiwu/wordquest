import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  getUpcomingBattle,
  joinBattle,
  submitBattleAnswer,
  type BattleChallengeView,
  type UpcomingBattle,
} from '@/services/bossBattle';
import { getMyPassport, type PassportBossBattleResult } from '@/services/passport';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { AliBubble } from '@/components/AliBubble';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'BossBattle'>;

type Phase = 'loading' | 'upcoming' | 'joining' | 'active' | 'feedback' | 'ended' | 'error';

interface Feedback {
  isCorrect: boolean;
  correctAnswer: string;
  exampleSentence: string;
  xpAwarded: number;
  aliQuickReaction: string | null;
}

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
  const accessToken = useAuthStore((s) => s.accessToken);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState('Could not reach the Boss Battle right now.');
  const [upcoming, setUpcoming] = useState<UpcomingBattle | null>(null);
  const [challenge, setChallenge] = useState<BattleChallengeView | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [aliBubble, setAliBubble] = useState<{ id: number; message: string } | null>(null);
  const aliBubbleCounter = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [history, setHistory] = useState<PassportBossBattleResult[]>([]);

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
      setPhase('active');
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
      if (result.aliQuickReaction) {
        aliBubbleCounter.current += 1;
        setAliBubble({ id: aliBubbleCounter.current, message: result.aliQuickReaction });
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

  if (phase === 'upcoming' && upcoming) {
    const startMs = new Date(upcoming.scheduledStartUtc).getTime();
    const remainingMs = startMs - now;

    return (
      <ScrollView style={styles.flexFill} contentContainerStyle={styles.centeredScrollContent}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Boss Battle</Text>
        <Text style={styles.subtitle}>
          {upcoming.status === 'LIVE'
            ? 'This week’s battle is live now.'
            : `Starts ${new Date(upcoming.scheduledStartUtc).toLocaleString()}`}
        </Text>
        {upcoming.status !== 'LIVE' && (
          <View style={styles.countdownCard}>
            <Text style={styles.countdownLabel}>
              {remainingMs > 0 ? 'Battle opens in' : 'Battle is opening…'}
            </Text>
            <Text style={styles.countdownValue}>{formatCountdown(remainingMs)}</Text>
          </View>
        )}
        {upcoming.status === 'LIVE' && (
          <Pressable
            style={styles.button}
            onPress={onJoin}
            accessibilityRole="button"
            accessibilityLabel="Join battle"
          >
            <Text style={styles.buttonText}>Join battle</Text>
          </Pressable>
        )}
        <HistorySection history={history} styles={styles} />
      </ScrollView>
    );
  }

  if (phase === 'ended') {
    return (
      <ScrollView style={styles.flexFill} contentContainerStyle={styles.centeredScrollContent}>
        <Text style={styles.title}>Battle complete</Text>
        <Pressable
          style={styles.button}
          onPress={() => navigation.navigate('BossBattleLeaderboard')}
          accessibilityRole="button"
          accessibilityLabel="See leaderboard"
        >
          <Text style={styles.buttonText}>See leaderboard</Text>
        </Pressable>
        <HistorySection history={history} styles={styles} />
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
            onDismiss={() => setAliBubble(null)}
          />
        )}
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.progressLabel}>Boss Battle</Text>
        <View style={styles.clueCard}>
          <Text style={styles.partOfSpeech}>{challenge.partOfSpeech}</Text>
          <Text style={styles.definition}>{challenge.definition}</Text>
          <Text style={styles.pattern}>{challenge.displayPattern}</Text>
        </View>

        {phase === 'active' && (
          <>
            <TextInput
              style={styles.input}
              value={answer}
              onChangeText={setAnswer}
              placeholder="Type the word..."
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Your answer"
            />
            <Pressable
              style={[styles.button, !answer.trim() && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={!answer.trim()}
              accessibilityRole="button"
              accessibilityLabel="Submit"
            >
              <Text style={styles.buttonText}>Submit</Text>
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
              {feedback.isCorrect ? `Correct! +${feedback.xpAwarded} XP` : 'Not quite.'}
            </Text>
            {!feedback.isCorrect && (
              <Text style={styles.revealText}>
                The word was <Text style={styles.revealWord}>{feedback.correctAnswer}</Text>
              </Text>
            )}
            <Pressable
              style={styles.button}
              onPress={onContinue}
              accessibilityRole="button"
              accessibilityLabel="Continue"
            >
              <Text style={styles.buttonText}>Continue</Text>
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
 * Renders the time left to a Boss Battle's scheduled start as
 * "1d 04h 12m 30s"-style segments, dropping leading zero segments so a
 * battle starting in 40 minutes reads as "40m 12s" rather than
 * "0d 00h 40m 12s". Never returns a negative countdown -- once the
 * clock reaches zero the 15s status poll takes over and the screen
 * moves to the LIVE "Join battle" state on its own.
 */
/**
 * "Let there be a history section where you can check your previous
 * plays and what position you got in those" -- renders under both the
 * upcoming and the just-ended views (not mid-battle, where it'd just
 * be clutter). Placement/XP per week already comes straight off
 * Passport's bossBattleHistory, so no new endpoint was needed.
 */
function HistorySection({
  history,
  styles,
}: {
  history: PassportBossBattleResult[];
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.historySection}>
      <Text style={styles.historyTitle}>Your battle history</Text>
      {history.length === 0 ? (
        <Text style={styles.historyEmpty}>No battles yet — your first result will show up here.</Text>
      ) : (
        history.map((h) => (
          <View key={h.weekId} style={styles.historyRow}>
            <Text style={styles.historyWeek}>{h.weekId}</Text>
            <Text style={[styles.historyPlacement, h.isWinner && styles.historyPlacementWinner]}>
              {ordinal(h.placement)} place{h.isWinner ? ' \u{1F3C6}' : ''}
            </Text>
            <Text style={styles.historyXp}>+{h.battleXp} XP</Text>
          </View>
        ))
      )}
    </View>
  );
}

function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const segments: string[] = [];
  if (days > 0) segments.push(`${days}d`);
  if (days > 0 || hours > 0) segments.push(`${String(hours).padStart(2, '0')}h`);
  if (days > 0 || hours > 0 || minutes > 0) segments.push(`${String(minutes).padStart(2, '0')}m`);
  segments.push(`${String(seconds).padStart(2, '0')}s`);

  return segments.join(' ');
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
  historySection: {
    width: '100%',
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  historyTitle: {
    color: colors.ink,
    fontSize: typography.scale.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  historyEmpty: { color: colors.inkMuted, fontSize: typography.scale.sm },
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
  subtitle: { color: colors.inkMuted, fontSize: typography.scale.md, textAlign: 'center' },
  countdownCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  countdownLabel: {
    color: colors.inkMuted,
    fontSize: typography.scale.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  countdownValue: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.xxl,
    fontWeight: typography.display.weight,
    letterSpacing: 1,
  },
  progressLabel: {
    color: colors.inkMuted,
    fontSize: typography.scale.sm,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  clueCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  partOfSpeech: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  definition: { color: colors.ink, fontSize: typography.scale.md },
  pattern: {
    color: colors.ink,
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
  feedbackBar: { gap: spacing.sm },
  feedbackText: { fontSize: typography.scale.md, fontWeight: '700' },
  revealText: { color: colors.inkMuted, fontSize: typography.scale.sm },
  revealWord: { color: colors.ink, fontWeight: '700' },
});
}
