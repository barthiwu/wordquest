import { useCallback, useState } from 'react';
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
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  getUpcomingBattle,
  joinBattle,
  submitBattleAnswer,
  type BattleChallengeView,
  type UpcomingBattle,
} from '@/services/bossBattle';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
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
  const accessToken = useAuthStore((s) => s.accessToken);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState('Could not reach the Boss Battle right now.');
  const [upcoming, setUpcoming] = useState<UpcomingBattle | null>(null);
  const [challenge, setChallenge] = useState<BattleChallengeView | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);

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
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Boss Battle</Text>
        <Text style={styles.subtitle}>
          {upcoming.status === 'LIVE'
            ? 'This week’s battle is live now.'
            : `Starts ${new Date(upcoming.scheduledStartUtc).toLocaleString()}`}
        </Text>
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
      </View>
    );
  }

  if (phase === 'ended') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Battle complete</Text>
        <Pressable
          style={styles.button}
          onPress={() => navigation.navigate('BossBattleLeaderboard')}
          accessibilityRole="button"
          accessibilityLabel="See leaderboard"
        >
          <Text style={styles.buttonText}>See leaderboard</Text>
        </Pressable>
      </View>
    );
  }

  if ((phase === 'active' || phase === 'feedback') && challenge) {
    return (
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
            {feedback.aliQuickReaction && (
              <Text style={styles.aliReactionText}>{feedback.aliQuickReaction}</Text>
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
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
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
  error: { color: colors.danger, fontSize: typography.scale.md, textAlign: 'center' },
  title: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.xl,
    fontWeight: typography.display.weight,
  },
  subtitle: { color: colors.inkMuted, fontSize: typography.scale.md, textAlign: 'center' },
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
  aliReactionText: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.sm,
    fontStyle: 'italic',
  },
});
