import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
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

/**
 * The Adaptive AI Learning Engine's Initial Calibration result (spec §1):
 * shown right after the 3rd Daily Quest word completes, and reachable
 * again any time from the Learning Profile — the player may accept or
 * reject the recommended difficulty; rejecting leaves currentDifficulty
 * exactly as it was.
 */
export function CalibrationResultScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('learningProfile');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const DIFFICULTY_LABELS: Record<string, string> = {
    BEGINNER: t('difficultyBeginner'),
    INTERMEDIATE: t('difficultyIntermediate'),
    ADVANCED: t('difficultyAdvanced'),
  };
  // Accepting or keeping current is a decision, not a destination -- the
  // player came from either the Learning Profile (Passport) or straight
  // off Quest Complete's calibration banner, and either way they expect
  // to land back there once the choice is made, not be left stranded on
  // this result screen. The brief delay lets them actually see the
  // "Difficulty updated." confirmation before it navigates away; the ref
  // guards against a double goBack() if a fast second tap slips in
  // before this one fires, and the cleanup effect cancels it if the
  // player has already left some other way.
  const leftRef = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  const returnToCaller = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    leaveTimer.current = setTimeout(() => navigation.goBack(), 900);
  };

  const load = useCallback(() => {
    if (!accessToken) return;
    getMyLearningProfile(accessToken)
      .then(setProfile)
      .catch(() => setError(t('loadError')));
  }, [accessToken, t]);

  useFocusEffect(load);

  const onAccept = async () => {
    if (!accessToken || busy) return;
    setBusy('accept');
    try {
      setProfile(await acceptRecommendedDifficulty(accessToken));
      setMessage(t('difficultyUpdated'));
      returnToCaller();
    } catch {
      setMessage(t('difficultyUpdateError'));
    } finally {
      setBusy(null);
    }
  };

  const onReject = async () => {
    if (!accessToken || busy) return;
    setBusy('reject');
    try {
      setProfile(await rejectRecommendedDifficulty(accessToken));
      setMessage(t('keepingCurrentDifficulty'));
      returnToCaller();
    } catch {
      setMessage(t('genericUpdateError'));
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
        <Text style={styles.title}>{t('title')}</Text>
        <View style={styles.section}>
          <Text style={styles.sectionBody}>
            {t('stillCalibrating', { count: 3 - profile.calibrationWordsCompleted })}
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('titleReady')}</Text>

      {message && <Text style={styles.message}>{message}</Text>}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('currentDifficultyLabel')}</Text>
        <Text style={styles.sectionBody}>
          {DIFFICULTY_LABELS[profile.currentDifficulty] ?? profile.currentDifficulty}
        </Text>
      </View>

      {profile.recommendedDifficulty && (
        <FadeInUp style={styles.recommendCard}>
          <Text style={styles.recommendTitle}>
            {t('recommendTitle', {
              difficulty:
                DIFFICULTY_LABELS[profile.recommendedDifficulty] ?? profile.recommendedDifficulty,
            })}
          </Text>
          <Text style={styles.recommendBody}>{t('recommendBody')}</Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, styles.acceptButton]}
              onPress={onAccept}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={t('acceptAccessibilityLabel')}
            >
              {busy === 'accept' ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <Text style={styles.buttonText}>{t('accept')}</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.button, styles.rejectButton]}
              onPress={onReject}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={t('keepCurrentAccessibilityLabel')}
            >
              {busy === 'reject' ? (
                <ActivityIndicator color={colors.arcaneSoft} />
              ) : (
                <Text style={[styles.buttonText, styles.rejectButtonText]}>{t('keepCurrent')}</Text>
              )}
            </Pressable>
          </View>
        </FadeInUp>
      )}

      {profile.initialCefrEstimate && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('cefrEstimateLabel')}</Text>
          <Text style={styles.sectionBody}>{profile.initialCefrEstimate}</Text>
        </View>
      )}

      {profile.weaknessAreas.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('weaknessAreasLabel')}</Text>
          <Text style={styles.sectionBody}>{profile.weaknessAreas.join(', ')}</Text>
        </View>
      )}
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
}
