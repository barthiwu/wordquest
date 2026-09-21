import { useCallback, useState, useMemo } from 'react';
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
  getMasterChallengeStatus,
  submitMasterChallenge,
  type MasterChallengeResult,
  type MasterChallengeStatus,
} from '@/services/masterChallenge';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'MasterChallenge'>;

/**
 * The Three-Word Master Challenge (spec §3.8) — a daily capstone, not
 * MVP-listed by name in BUILD_HANDOFF but fully built on the backend.
 * Locked until all three of today’s quests are complete; the reward is
 * separate from and doesn’t duplicate per-word XP.
 */
export function MasterChallengeScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [status, setStatus] = useState<MasterChallengeStatus | null>(null);
  const [paragraph, setParagraph] = useState('');
  const [result, setResult] = useState<MasterChallengeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getMasterChallengeStatus(accessToken)
      .then(setStatus)
      .catch(() => setError('Could not load the Master Challenge.'));
  }, [accessToken]);

  useFocusEffect(load);

  const onSubmit = async () => {
    if (!accessToken || !paragraph.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await submitMasterChallenge(accessToken, paragraph.trim());
      setResult(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit the Master Challenge.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!status && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  if (result) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Master Challenge complete</Text>
        <Text style={styles.subtitle}>+{result.xpAwarded} XP</Text>
        {Object.entries(result.scores).map(([key, value]) => (
          <View key={key} style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>{key}</Text>
            <Text style={styles.scoreValue}>{value}</Text>
          </View>
        ))}
        <Text style={styles.body}>{result.whatWentWell}</Text>
        <Text style={styles.bodyMuted}>{result.whatNeedsImprovement}</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Master Challenge</Text>

      {status && (
        <Text style={styles.subtitle}>
          {status.status === 'COMPLETED'
            ? 'Today’s challenge is already complete.'
            : `${status.wordsCompletedToday} / ${status.wordsRequired} daily words complete`}
        </Text>
      )}

      {status?.status === 'AVAILABLE' && (
        <>
          <Text style={styles.body}>
            Write one paragraph that uses all three of today’s words correctly.
          </Text>
          <TextInput
            style={styles.textArea}
            value={paragraph}
            onChangeText={setParagraph}
            multiline
            placeholder="Type your paragraph..."
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel="Your paragraph"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            style={[styles.button, (submitting || !paragraph.trim()) && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={submitting || !paragraph.trim()}
            accessibilityRole="button"
            accessibilityLabel="Submit"
          >
            {submitting ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.buttonText}>Submit</Text>
            )}
          </Pressable>
        </>
      )}

      {status?.status === 'LOCKED' && (
        <Text style={styles.body}>
          Complete all three of today’s Quests to unlock the Master Challenge.
        </Text>
      )}

      {error && !status && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: topInset + spacing.xxl, gap: spacing.md },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.danger, fontSize: typography.scale.md },
  title: {
    color: colors.ink,
    fontSize: typography.scale.xl,
    fontWeight: typography.display.weight,
  },
  subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm },
  body: { color: colors.ink, fontSize: typography.scale.md },
  bodyMuted: { color: colors.inkMuted, fontSize: typography.scale.sm },
  textArea: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.ink,
    fontSize: typography.scale.md,
    padding: spacing.md,
    minHeight: 160,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scoreLabel: {
    color: colors.inkMuted,
    fontSize: typography.scale.sm,
    textTransform: 'capitalize',
  },
  scoreValue: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
});
}
