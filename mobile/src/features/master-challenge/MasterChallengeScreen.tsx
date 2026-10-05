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
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
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
import { AliDeferredRecap } from '@/components/AliDeferredRecap';
import { BackButton } from '@/components/BackButton';
import { FadeInUp } from '@/components/FadeInUp';
import { ScoreRing } from '@/components/ScoreRing';
import { trackEvent } from '@/services/analyticsClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'MasterChallenge'>;

function scoreBandColor(score: number, colors: ThemeColors): string {
  if (score >= 90) return colors.success;
  if (score >= 75) return colors.arcaneSoft;
  return colors.warning;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
  const { t } = useTranslation('masterChallenge');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [status, setStatus] = useState<MasterChallengeStatus | null>(null);
  const [paragraph, setParagraph] = useState('');
  const [result, setResult] = useState<MasterChallengeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Telemetry spec §10. MASTER_CHALLENGE_VIEWED fires once on mount;
  // MASTER_CHALLENGE_STARTED fires the first time status resolves as
  // AVAILABLE (startedRef guards this against refiring on every
  // useFocusEffect(load) refocus below); MASTER_CHALLENGE_ABANDONED
  // fires on unmount only if the player actually started but never
  // reached a result -- same mount/unmount-ref pattern used everywhere
  // else this phase.
  const startedRef = useRef(false);
  // Unmount cleanups close over stale state, so `result` needs a ref
  // mirror kept current at render time (same pattern as WordDuelScreen's
  // latestRef) rather than reading the possibly-stale `result` directly.
  const resultRef = useRef<MasterChallengeResult | null>(null);
  resultRef.current = result;
  useEffect(() => {
    trackEvent('MASTER_CHALLENGE_VIEWED');
    return () => {
      if (startedRef.current && !resultRef.current) {
        trackEvent('MASTER_CHALLENGE_ABANDONED');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Score-category labels need the translated `t` function, so this
  // lives inside the component rather than as a module-level constant —
  // same keys (wordUsage/coherence/grammar/vocabulary/context), just
  // built from t() each render.
  const scoreLabels: Record<string, string> = {
    wordUsage: t('scoreWordUsage'),
    coherence: t('scoreCoherence'),
    grammar: t('scoreGrammar'),
    vocabulary: t('scoreVocab'),
    context: t('scoreContext'),
  };

  const load = useCallback(() => {
    if (!accessToken) return;
    getMasterChallengeStatus(accessToken)
      .then((s) => {
        setStatus(s);
        if (s.status === 'AVAILABLE' && !startedRef.current) {
          startedRef.current = true;
          trackEvent('MASTER_CHALLENGE_STARTED');
        }
      })
      .catch(() => setError(t('loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useFocusEffect(load);

  const onSubmit = async () => {
    if (!accessToken || !paragraph.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await submitMasterChallenge(accessToken, paragraph.trim());
      trackEvent('MASTER_CHALLENGE_COMPLETED');
      setResult(r);
    } catch (err) {
      // Only the player-fixable rule messages (400, e.g. word count) are shown
      // as-is; anything else (AI not configured, server errors) gets the
      // friendly generic line instead of raw server text.
      setError(err instanceof ApiError && err.status === 400 ? err.message : t('submitError'));
      trackEvent('GAMEPLAY_ERROR', {
        step: 'masterChallengeSubmit',
        status: err instanceof ApiError ? err.status : undefined,
      });
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
    const subScores = result.scores;
    const compositeScore =
      (subScores.wordUsage +
        subScores.coherence +
        subScores.grammar +
        subScores.vocabulary +
        subScores.context) /
      5;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.resultHeaderRow}>
          <Text style={styles.title}>{t('completeTitle')}</Text>
          <View style={styles.xpPill}>
            <Ionicons name="sparkles" size={12} color={colors.glyph} />
            <Text style={styles.xpPillText}>{t('xpAwarded', { xp: result.xpAwarded })}</Text>
          </View>
        </View>

        <FadeInUp style={styles.heroRingWrap}>
          <ScoreRing
            score={compositeScore}
            size={168}
            strokeWidth={14}
            color={colors.arcane}
            label={t('compositeLabel')}
          />
        </FadeInUp>

        <FadeInUp style={styles.subScoreRow} delay={120}>
          {Object.entries(subScores).map(([key, value]) => (
            <View key={key} style={styles.subScoreItem}>
              <ScoreRing
                score={value}
                size={56}
                strokeWidth={6}
                color={scoreBandColor(value, colors)}
                valueFontSize={14}
              />
              <Text style={styles.subScoreLabel}>{scoreLabels[key] ?? key}</Text>
            </View>
          ))}
        </FadeInUp>

        {result.allWordsUsedCorrectly && (
          <FadeInUp style={styles.masteredPill} delay={200}>
            <Ionicons name="ribbon" size={14} color={colors.glyph} />
            <Text style={styles.masteredPillText}>{t('allWordsCorrect')}</Text>
          </FadeInUp>
        )}

        <FadeInUp style={[styles.feedbackCard, styles.feedbackCardWorked]} delay={260}>
          <View style={styles.feedbackCardHeader}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[styles.feedbackCardLabel, { color: colors.success }]}>
              {t('whatWorkedLabel')}
            </Text>
          </View>
          <Text style={styles.feedbackCardText}>{result.whatWentWell}</Text>
        </FadeInUp>

        <FadeInUp style={[styles.feedbackCard, styles.feedbackCardPolish]} delay={340}>
          <View style={styles.feedbackCardHeader}>
            <Ionicons name="locate-outline" size={15} color={colors.warning} />
            <Text style={[styles.feedbackCardLabel, { color: colors.warning }]}>
              {t('polishLabel')}
            </Text>
          </View>
          <Text style={styles.feedbackCardText}>{result.whatNeedsImprovement}</Text>
        </FadeInUp>

        <AliDeferredRecap
          reactions={result.deferredAliReactions}
          colors={colors}
          style={styles.deferredRecap}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('title')}</Text>

      {status && (
        <Text style={styles.subtitle}>
          {status.status === 'COMPLETED'
            ? t('alreadyComplete')
            : t('wordsProgress', {
                completed: status.wordsCompletedToday,
                required: status.wordsRequired,
              })}
        </Text>
      )}

      {status?.status === 'AVAILABLE' && (
        <>
          <Text style={styles.body}>{t('instructions')}</Text>
          <TextInput
            style={styles.textArea}
            value={paragraph}
            onChangeText={setParagraph}
            multiline
            placeholder={t('paragraphPlaceholder')}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t('paragraphLabel')}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            style={[styles.button, (submitting || !paragraph.trim()) && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={submitting || !paragraph.trim()}
            accessibilityRole="button"
            accessibilityLabel={t('submit')}
          >
            {submitting ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.buttonText}>{t('submit')}</Text>
            )}
          </Pressable>
        </>
      )}

      {status?.status === 'LOCKED' && <Text style={styles.body}>{t('lockedMessage')}</Text>}

      {error && !status && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, paddingTop: topInset + spacing.xxl, gap: spacing.md },
    deferredRecap: { marginTop: spacing.xs },
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
    resultHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    xpPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: hexToRgba(colors.glyph, 0.14),
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    xpPillText: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
    heroRingWrap: { alignSelf: 'center', marginVertical: spacing.sm },
    subScoreRow: { flexDirection: 'row', justifyContent: 'space-between' },
    subScoreItem: { alignItems: 'center', gap: spacing.xs },
    subScoreLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: '600' },
    feedbackCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: spacing.md,
      gap: spacing.xs,
    },
    feedbackCardWorked: {
      backgroundColor: hexToRgba(colors.success, 0.1),
      borderColor: hexToRgba(colors.success, 0.35),
    },
    feedbackCardPolish: {
      backgroundColor: hexToRgba(colors.warning, 0.1),
      borderColor: hexToRgba(colors.warning, 0.35),
    },
    feedbackCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    feedbackCardLabel: {
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    feedbackCardText: { color: colors.ink, fontSize: typography.scale.sm, lineHeight: 20 },
    masteredPill: {
      flexDirection: 'row',
      alignSelf: 'center',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: hexToRgba(colors.glyph, 0.14),
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    masteredPillText: { color: colors.glyph, fontSize: typography.scale.xs, fontWeight: '700' },
  });
}
