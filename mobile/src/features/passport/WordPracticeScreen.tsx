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
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
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

const LEVEL_LABEL: Record<MasteryLevel, string> = {
  NEW: 'New',
  RECOGNIZING: 'Recognizing',
  RECALLING: 'Recalling',
  STRONG: 'Strong',
  MASTERED: 'Mastered',
};

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
 * live Quest.
 */
export function WordPracticeScreen({ route, navigation }: Props) {
  const { wordId } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);

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
      .catch(() => setError('Could not load this word.'));
  }, [accessToken, wordId]);

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
      setOverview((prev) => (prev ? { ...prev, sentenceScore: result.score } : prev));
    } catch {
      setError('Could not submit your sentence. Please try again.');
    } finally {
      setSentenceBusy(false);
    }
  };

  const paragraphWordCount = paragraphText.trim().length === 0 ? 0 : paragraphText.trim().split(/\s+/).length;
  const paragraphValid = paragraphWordCount >= 30 && paragraphWordCount <= 100;

  const onSubmitParagraph = async () => {
    if (!accessToken || !paragraphValid || paragraphBusy) return;
    setParagraphBusy(true);
    try {
      const result = await submitPracticeParagraph(accessToken, wordId, paragraphText.trim());
      setParagraphResult(result);
      applyLevelUpdate(result.masteryLevel);
      setOverview((prev) => (prev ? { ...prev, paragraphScore: result.score } : prev));
    } catch {
      setError('Could not submit your paragraph. Please try again.');
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
        <Text style={styles.word}>{overview.word}</Text>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>{LEVEL_LABEL[overview.currentLevel]}</Text>
        </View>
      </View>
      <Text style={styles.practiceNote}>Practice mode — no XP or rewards, just mastery.</Text>
      <Text style={styles.guessNote}>
        Guess — {overview.guessScore}% (only moves from a live Quest, not practiced here)
      </Text>

      <View style={styles.tabs}>
        <ModeTab
          label="Sentence"
          active={mode === 'sentence'}
          onPress={() => selectMode('sentence')}
          styles={styles}
        />
        <ModeTab
          label="Paragraph"
          active={mode === 'paragraph'}
          onPress={() => selectMode('paragraph')}
          styles={styles}
        />
      </View>

      {mode === 'sentence' && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Sentence — {overview.sentenceScore}%</Text>
          <Text style={styles.reference}>{overview.definition}</Text>
          <Text style={styles.referenceMuted}>{overview.exampleSentence}</Text>

          {!sentenceResult && (
            <>
              <TextInput
                style={styles.textArea}
                value={sentenceText}
                onChangeText={setSentenceText}
                multiline
                placeholder={`Write one sentence using "${overview.word}"...`}
                placeholderTextColor={colors.inkMuted}
                accessibilityLabel="Your sentence"
              />
              <Pressable
                style={[
                  styles.button,
                  (!sentenceText.trim() || sentenceBusy) && styles.buttonDisabled,
                ]}
                onPress={onSubmitSentence}
                disabled={!sentenceText.trim() || sentenceBusy}
                accessibilityRole="button"
                accessibilityLabel="Submit"
              >
                {sentenceBusy ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <Text style={styles.buttonText}>Submit</Text>
                )}
              </Pressable>
            </>
          )}

          {sentenceResult && (
            <FadeInUp style={styles.resultBlock}>
              <ScoreList scores={sentenceResult.scores} styles={styles} />
              <Text style={styles.reference}>{sentenceResult.whatWentWell}</Text>
              <Text style={styles.referenceMuted}>{sentenceResult.whatNeedsImprovement}</Text>
              {sentenceResult.justMastered && (
                <Text style={styles.masteredBanner}>Mastered — every skill area cleared.</Text>
              )}
              <Pressable
                style={styles.button}
                onPress={() => {
                  setSentenceResult(null);
                  setSentenceText('');
                }}
                accessibilityRole="button"
                accessibilityLabel="Practice again"
              >
                <Text style={styles.buttonText}>Practice again</Text>
              </Pressable>
            </FadeInUp>
          )}
        </View>
      )}

      {mode === 'paragraph' && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Paragraph — {overview.paragraphScore}%</Text>
          <Text style={styles.reference}>{overview.definition}</Text>
          <Text style={styles.referenceMuted}>{overview.exampleSentence}</Text>

          {!paragraphResult && (
            <>
              <TextInput
                style={[styles.textArea, styles.textAreaTall]}
                value={paragraphText}
                onChangeText={setParagraphText}
                multiline
                placeholder={`Write a 30-100 word paragraph using "${overview.word}"...`}
                placeholderTextColor={colors.inkMuted}
                accessibilityLabel="Your paragraph"
              />
              <Text style={styles.referenceMuted}>{paragraphWordCount} / 30-100 words</Text>
              <Pressable
                style={[styles.button, (!paragraphValid || paragraphBusy) && styles.buttonDisabled]}
                onPress={onSubmitParagraph}
                disabled={!paragraphValid || paragraphBusy}
                accessibilityRole="button"
                accessibilityLabel="Submit"
              >
                {paragraphBusy ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <Text style={styles.buttonText}>Submit</Text>
                )}
              </Pressable>
            </>
          )}

          {paragraphResult && (
            <FadeInUp style={styles.resultBlock}>
              <ScoreList scores={paragraphResult.scores} styles={styles} />
              <Text style={styles.reference}>{paragraphResult.whatWentWell}</Text>
              <Text style={styles.referenceMuted}>{paragraphResult.whatNeedsImprovement}</Text>
              {paragraphResult.justMastered && (
                <Text style={styles.masteredBanner}>Mastered — every skill area cleared.</Text>
              )}
              <Pressable
                style={styles.button}
                onPress={() => {
                  setParagraphResult(null);
                  setParagraphText('');
                }}
                accessibilityRole="button"
                accessibilityLabel="Practice again"
              >
                <Text style={styles.buttonText}>Practice again</Text>
              </Pressable>
            </FadeInUp>
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

function ScoreList({
  scores,
  styles,
}: {
  scores: Record<string, number>;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.scoreCard}>
      {Object.entries(scores).map(([key, value]) => (
        <View key={key} style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>{key}</Text>
          <Text style={styles.scoreValue}>{value}</Text>
        </View>
      ))}
    </View>
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
    masteredBanner: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
    scoreCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    scoreRow: { flexDirection: 'row', justifyContent: 'space-between' },
    scoreLabel: { color: colors.inkMuted, fontSize: typography.scale.sm, textTransform: 'capitalize' },
    scoreValue: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
  });
}
