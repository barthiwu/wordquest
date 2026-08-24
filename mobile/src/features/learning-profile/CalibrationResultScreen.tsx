import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  acceptRecommendedDifficulty,
  getMyLearningProfile,
  rejectRecommendedDifficulty,
  type LearningProfile,
} from '@/services/learningProfile';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { FadeInUp } from '@/components/FadeInUp';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'CalibrationResult'>;

const DIFFICULTY_LABELS: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
};

/**
 * The Adaptive AI Learning Engine's Initial Calibration result (spec §1):
 * shown right after the 3rd Daily Quest word completes, and reachable
 * again any time from the Learning Profile — the player may accept or
 * reject the recommended difficulty; rejecting leaves currentDifficulty
 * exactly as it was.
 */
export function CalibrationResultScreen({ navigation }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getMyLearningProfile(accessToken)
      .then(setProfile)
      .catch(() => setError('Could not load your Learning Profile.'));
  }, [accessToken]);

  useFocusEffect(load);

  const onAccept = async () => {
    if (!accessToken || busy) return;
    setBusy('accept');
    try {
      setProfile(await acceptRecommendedDifficulty(accessToken));
      setMessage('Difficulty updated.');
    } catch {
      setMessage('Could not update your difficulty right now.');
    } finally {
      setBusy(null);
    }
  };

  const onReject = async () => {
    if (!accessToken || busy) return;
    setBusy('reject');
    try {
      setProfile(await rejectRecommendedDifficulty(accessToken));
      setMessage('Keeping your current difficulty.');
    } catch {
      setMessage('Could not update that right now.');
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  if (!profile.calibrated) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Learning Profile</Text>
        <View style={styles.section}>
          <Text style={styles.sectionBody}>
            Still calibrating — complete {3 - profile.calibrationWordsCompleted} more Daily Quest
            word{3 - profile.calibrationWordsCompleted === 1 ? '' : 's'} to see your result.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Your Learning Profile</Text>

      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current difficulty</Text>
        <Text style={styles.sectionBody}>
          {DIFFICULTY_LABELS[profile.currentDifficulty] ?? profile.currentDifficulty}
        </Text>
      </View>

      {profile.recommendedDifficulty && (
        <FadeInUp style={styles.recommendCard}>
          <Text style={styles.recommendTitle}>
            We recommend{' '}
            {DIFFICULTY_LABELS[profile.recommendedDifficulty] ?? profile.recommendedDifficulty}
          </Text>
          <Text style={styles.recommendBody}>
            Based on your first 3 words, this level looks like a better fit for you.
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, styles.acceptButton]}
              onPress={onAccept}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel="Accept recommended difficulty"
            >
              {busy === 'accept' ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <Text style={styles.buttonText}>Accept</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.button, styles.rejectButton]}
              onPress={onReject}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel="Keep current difficulty"
            >
              {busy === 'reject' ? (
                <ActivityIndicator color={colors.arcaneSoft} />
              ) : (
                <Text style={[styles.buttonText, styles.rejectButtonText]}>Keep current</Text>
              )}
            </Pressable>
          </View>
        </FadeInUp>
      )}

      {profile.initialCefrEstimate && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Initial CEFR estimate</Text>
          <Text style={styles.sectionBody}>{profile.initialCefrEstimate}</Text>
        </View>
      )}

      {profile.weaknessAreas.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Areas to work on</Text>
          <Text style={styles.sectionBody}>{profile.weaknessAreas.join(', ')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md },
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
  message: { color: colors.arcaneSoft, fontSize: typography.scale.sm },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.scale.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sectionBody: { color: colors.inkMuted, fontSize: typography.scale.sm },
  recommendCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.arcaneSoft,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  recommendTitle: { color: colors.arcaneSoft, fontSize: typography.scale.md, fontWeight: '700' },
  recommendBody: { color: colors.inkMuted, fontSize: typography.scale.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  button: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  acceptButton: { backgroundColor: colors.arcane },
  rejectButton: { borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
  rejectButtonText: { color: colors.arcaneSoft },
});
