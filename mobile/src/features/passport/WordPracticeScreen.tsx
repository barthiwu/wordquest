import { useCallback, useMemo, useState } from 'react';
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
import type { TFunction } from 'i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { ScoreRing } from '@/components/ScoreRing';
import {
  getPracticeOverview,
  submitPracticeParagraph,
  submitPracticeSentence,
  type PracticeWordOverview,
  type PracticeWritingResult,
} from '@/services/practice';
import type { MasteryLevel } from '@/services/users';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { FadeInUp } from '@/components/FadeInUp';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'WordPractice'>;

type Mode = 'sentence' | 'paragraph';

function scoreBandColor(score: number, colors: ThemeColors): string {
  if (score >= 90) return colors.success;
  if (score >= 75) return colors.arcaneSoft;
  return colors.warning;
}

function capitalize(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// result.scores is a Record<string, number> -- an open-ended shape from
// the practice-scoring API, so we can't guarantee every possible key up
// front. scoreCategoryLabel looks the key up in the shared
// common:scoreCategories.* map (the dimension names already known to be
// in use across the app -- grammar, vocabulary, coherence, etc., kept in
// sync with MasterChallengeScreen's own fixed set); any key not in that
// map falls back to a capitalized rendering of the raw key via i18next's
// defaultValue, so an unrecognized dimension degrades to readable
// English instead of breaking.
function scoreCategoryLabel(key: string, t: TFunction): string {
  return t(`common:scoreCategories.${key}`, { defaultValue: capitalize(key) });
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Profile > My Words > tap a word — practice Sentence/Paragraph again
 * for a word already met, outside the Daily Quest entirely. No XP, no
 * Glyphs, no streak: this exists purely so mastery scores (and
 * anything they gate, like the CEFR-unlock threshold and Passport's
 * "words mastered" count) can keep moving between quests, per the
 * explicit "no XP or rewards, just mastery" request this was built
 * from. See backend PracticeService's doc comment for exactly what
 * does and doesn't update from here.
 *
 * Guess is deliberately left out of practice: once a player has seen
 * a word's Guess score move at all, they've already seen its
 * omission pattern before, which makes a repeat attempt trivially
 * easy rather than a real test ("no longer much fun" was the exact
 * feedback this came from). Guess score still shown read-only below,
 * since it's still real mastery data -- it just only moves from a
 * live Quest. It also no longer gates MASTERED past the first correct
 * guess ever made (see backend MasteryService.applyMasteryGate) -- once
 * a player has gotten a word's guess right once, that dimension is
 * satisfied for good, so getting to MASTERED here only ever depends on
 * Sentence and Paragraph, each stored as this word's best score yet
 * (a weaker re-practice attempt never lowers what's on file).
 */
export function WordPracticeScreen({ route, navigation }: Props) {
  const { wordId } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('wordPractice');
  const accessToken = useAuthStore((s) => s.accessToken);

  const LEVEL_LABEL: Record<MasteryLevel, string> = {
    NEW: t('levelNew'),
    RECOGNIZING: t('levelRecognizing'),
    RECALLING: t('levelRecalling'),
    STRONG: t('levelStrong'),
    MASTERED: t('levelMastered'),
  };

  const [overview, setOverview] = useState<PracticeWordOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('sentence');

  const [sentenceText, setSentenceText] = useState('');
  const [sentenceBusy, setSentenceBusy] = useState(false);
  const [sentenceResult, setSentenceResult] = useState<PracticeWritingResult | null>(null);

  const [paragraphText, setParagraphText] = useState('');
  const [paragraphBusy, setParagraphBusy] = useState(false);
  const [paragraphResult, setParagraphResult] = useState<PracticeWritingResult | null>(null);

  const loadOverview = useCallback(() => {
    if (!accessToken) return;
    getPracticeOverview(accessToken, wordId)
      .then(setOverview)
      .catch(() => setError(t('loadError')));
  }, [accessToken, wordId, t]);

  useFocusEffect(loadOverview);

  const selectMode = (next: Mode) => {
    setMode(next);
  };

  const applyLevelUpdate = (level: MasteryLevel) => {
    setOverview((prev) => (prev ? { ...prev, currentLevel: level } : prev));
  };

  const onSubmitSentence = async () => {
    if (!accessToken || !sentenceText.trim() || sentenceBusy) return;
    setSentenceBusy(true);
    try {
      const result = await submitPracticeSentence(accessToken, wordId, sentenceText.trim());
      setSentenceResult(result);
      applyLevelUpdate(result.masteryLevel);
      // bestScore, not score -- the card should reflect what's actually
      // stored (the higher of this attempt and any prior best), while
      // the result screen's own ring below still shows this attempt's
      // honest score.
      setOverview((prev) => (prev ? { ...prev, sentenceScore: result.bestScore } : prev));
    } catch {
      setError(t('sentenceSubmitError'));
    } finally {
      setSentenceBusy(false);
    }
  };

  const paragraphWordCount =
    paragraphText.trim().length === 0 ? 0 : paragraphText.trim().split(/\s+/).length;
  const paragraphValid = paragraphWordCount >= 30 && paragraphWordCount <= 100;

  const onSubmitParagraph = async () => {
    if (!accessToken || !paragraphValid || paragraphBusy) return;
    setParagraphBusy(true);
    try {
      const result = await submitPracticeParagraph(accessToken, wordId, paragraphText.trim());
      setParagraphResult(result);
      applyLevelUpdate(result.masteryLevel);
      // bestScore, not score -- same reasoning as onSubmitSentence above.
      setOverview((prev) => (prev ? { ...prev, paragraphScore: result.bestScore } : prev));
    } catch {
      setError(t('paragraphSubmitError'));
    } finally {
      setParagraphBusy(false);
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

  if (!overview) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => navigation.goBack()} />

      <View style={styles.header}>
        {/* overview.word is the actual vocabulary word being practiced --
            gameplay content from the practice API, left untranslated. */}
        <Text style={styles.word}>{overview.word}</Text>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>{LEVEL_LABEL[overview.currentLevel]}</Text>
        </View>
      </View>
      <Text style={styles.practiceNote}>{t('practiceNote')}</Text>
      <Text style={styles.guessNote}>{t('guessNote', { score: overview.guessScore })}</Text>

      <View style={styles.tabs}>
        <ModeTab
          label={t('sentenceTab')}
          active={mode === 'sentence'}
          onPress={() => selectMode('sentence')}
          styles={styles}
        />
        <ModeTab
          label={t('paragraphTab')}
          active={mode === 'paragraph'}
          onPress={() => selectMode('paragraph')}
          styles={styles}
        />
      </View>

      {mode === 'sentence' && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            {t('sentenceCardLabel', { score: overview.sentenceScore })}
          </Text>
          {/* overview.definition / overview.exampleSentence are gameplay
              content (the word's definition and a CEFR-level example
              sentence) pulled from the practice API -- left untranslated. */}
          <Text style={styles.reference}>{overview.definition}</Text>
          <Text style={styles.referenceMuted}>{overview.exampleSentence}</Text>

          {!sentenceResult && (
            <>
              <TextInput
                style={styles.textArea}
                value={sentenceText}
                onChangeText={setSentenceText}
                multiline
                placeholder={t('sentencePlaceholder', { word: overview.word })}
                placeholderTextColor={colors.inkMuted}
                accessibilityLabel={t('sentenceInputAccessibilityLabel')}
              />
              <Pressable
                style={[
                  styles.button,
                  (!sentenceText.trim() || sentenceBusy) && styles.buttonDisabled,
                ]}
                onPress={onSubmitSentence}
                disabled={!sentenceText.trim() || sentenceBusy}
                accessibilityRole="button"
                accessibilityLabel={t('submit')}
              >
                {sentenceBusy ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <Text style={styles.buttonText}>{t('submit')}</Text>
                )}
              </Pressable>
            </>
          )}

          {sentenceResult && (
            <PracticeResult
              result={sentenceResult}
              onPracticeAgain={() => {
                setSentenceResult(null);
                setSentenceText('');
              }}
              colors={colors}
              styles={styles}
              t={t}
            />
          )}
        </View>
      )}

      {mode === 'paragraph' && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            {t('paragraphCardLabel', { score: overview.paragraphScore })}
          </Text>
          <Text style={styles.reference}>{overview.definition}</Text>
          <Text style={styles.referenceMuted}>{overview.exampleSentence}</Text>

          {!paragraphResult && (
            <>
              <TextInput
                style={[styles.textArea, styles.textAreaTall]}
                value={paragraphText}
                onChangeText={setParagraphText}
                multiline
                placeholder={t('paragraphPlaceholder', { word: overview.word })}
                placeholderTextColor={colors.inkMuted}
                accessibilityLabel={t('paragraphInputAccessibilityLabel')}
              />
              <Text style={styles.referenceMuted}>
                {t('paragraphWordCount', { count: paragraphWordCount })}
              </Text>
              <Pressable
                style={[styles.button, (!paragraphValid || paragraphBusy) && styles.buttonDisabled]}
                onPress={onSubmitParagraph}
                disabled={!paragraphValid || paragraphBusy}
                accessibilityRole="button"
                accessibilityLabel={t('submit')}
              >
                {paragraphBusy ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <Text style={styles.buttonText}>{t('submit')}</Text>
                )}
              </Pressable>
            </>
          )}

          {paragraphResult && (
            <PracticeResult
              result={paragraphResult}
              onPracticeAgain={() => {
                setParagraphResult(null);
                setParagraphText('');
              }}
              colors={colors}
              styles={styles}
              t={t}
            />
          )}
        </View>
      )}
    </ScrollView>
  );
}

function ModeTab({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PracticeResult({
  result,
  onPracticeAgain,
  colors,
  styles,
  t,
}: {
  result: PracticeWritingResult;
  onPracticeAgain: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: TFunction;
}) {
  return (
    <FadeInUp style={styles.resultBlock}>
      <FadeInUp style={styles.heroRingWrap}>
        <ScoreRing
          score={result.score}
          size={168}
          strokeWidth={14}
          color={colors.arcane}
          label={t('compositeScoreLabel')}
        />
      </FadeInUp>

      <FadeInUp style={styles.subScoreRow} delay={120}>
        {Object.entries(result.scores).map(([key, value]) => (
          <View key={key} style={styles.subScoreItem}>
            <ScoreRing
              score={value}
              size={56}
              strokeWidth={6}
              color={scoreBandColor(value, colors)}
              valueFontSize={14}
            />
            <Text style={styles.subScoreLabel}>{scoreCategoryLabel(key, t)}</Text>
          </View>
        ))}
      </FadeInUp>

      <FadeInUp style={[styles.feedbackCard, styles.feedbackCardWorked]} delay={220}>
        <View style={styles.feedbackCardHeader}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={[styles.feedbackCardLabel, { color: colors.success }]}>
            {t('whatWorkedLabel')}
          </Text>
        </View>
        {/* result.whatWentWell is AI-generated feedback on this specific
            submission, not a hardcoded literal -- left untranslated. */}
        <Text style={styles.feedbackCardText}>{result.whatWentWell}</Text>
      </FadeInUp>

      <FadeInUp style={[styles.feedbackCard, styles.feedbackCardPolish]} delay={300}>
        <View style={styles.feedbackCardHeader}>
          <Ionicons name="locate-outline" size={15} color={colors.warning} />
          <Text style={[styles.feedbackCardLabel, { color: colors.warning }]}>
            {t('polishThisLabel')}
          </Text>
        </View>
        {/* result.whatNeedsImprovement -- same as whatWentWell above. */}
        <Text style={styles.feedbackCardText}>{result.whatNeedsImprovement}</Text>
      </FadeInUp>

      {result.justMastered && (
        <FadeInUp style={styles.masteredPill} delay={380}>
          <Ionicons name="ribbon" size={14} color={colors.glyph} />
          <Text style={styles.masteredPillText}>{t('masteredPill')}</Text>
        </FadeInUp>
      )}

      <Pressable
        style={styles.button}
        onPress={onPracticeAgain}
        accessibilityRole="button"
        accessibilityLabel={t('practiceAgain')}
      >
        <Text style={styles.buttonText}>{t('practiceAgain')}</Text>
      </Pressable>
    </FadeInUp>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xxl,
      paddingTop: topInset + spacing.xl,
      gap: spacing.md,
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
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    word: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
      textTransform: 'capitalize',
    },
    levelBadge: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    levelBadgeText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    practiceNote: { color: colors.inkMuted, fontSize: typography.scale.sm },
    guessNote: { color: colors.inkMuted, fontSize: typography.scale.xs, marginTop: spacing.xs },
    tabs: { flexDirection: 'row', gap: spacing.sm },
    tab: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    tabActive: { backgroundColor: colors.arcane, borderColor: colors.arcane },
    tabText: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    tabTextActive: { color: colors.ink },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    cardLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    pattern: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: '700',
      letterSpacing: 4,
    },
    reference: { color: colors.ink, fontSize: typography.scale.md },
    referenceMuted: { color: colors.inkMuted, fontSize: typography.scale.sm },
    input: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.ink,
      fontSize: typography.scale.md,
      padding: spacing.md,
    },
    textArea: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.ink,
      fontSize: typography.scale.md,
      padding: spacing.md,
      minHeight: 70,
      textAlignVertical: 'top',
    },
    textAreaTall: { minHeight: 130 },
    button: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    resultBlock: { gap: spacing.sm },
    resultText: { fontSize: typography.scale.md, fontWeight: '700' },
    revealText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    revealWord: { color: colors.ink, fontWeight: '700' },
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
