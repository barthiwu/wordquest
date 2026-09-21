import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { listMyWordMastery, type WordMasteryListItem } from '@/services/users';
import type { MasteryLevel } from '@/services/users';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'WordMastery'>;

type Filter = 'all' | 'inProgress' | 'mastered';

// Mirrors MasteryService's skillAreaMasteryThresholdPercent (backend
// config/gameplay-rules.ts) — a word only crosses MASTERED once every
// skill area clears this. Duplicated here (display-only) rather than
// shared, same as the rest of this screen's data shape.
const MASTERY_THRESHOLD = 75;

const LEVEL_LABEL: Record<MasteryLevel, string> = {
  NEW: 'New',
  RECOGNIZING: 'Recognizing',
  RECALLING: 'Recalling',
  STRONG: 'Strong',
  MASTERED: 'Mastered',
};

/**
 * Profile > My Words — every word the player has been presented with,
 * and where they stand on it. Requested alongside the flag/leaderboard
 * work: "a section in the profile where one can see the words they've
 * guessed, and see if they can improve on their mastery of said
 * words." Each card breaks a word's mastery down into the three gated
 * skill areas (Guess/Sentence/Paragraph) and names whichever is
 * weakest, since "mastered or not" alone doesn't say what to work on.
 */
export function WordMasteryScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [words, setWords] = useState<WordMasteryListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    if (!accessToken) return;
    listMyWordMastery(accessToken)
      .then(setWords)
      .catch(() => setError('Could not load your words.'));
  }, [accessToken]);

  useFocusEffect(load);

  const filtered = useMemo(() => {
    if (!words) return [];
    const q = query.trim().toLowerCase();
    return words.filter((w) => {
      if (q && !w.word.toLowerCase().includes(q)) return false;
      if (filter === 'mastered') return w.currentLevel === 'MASTERED';
      if (filter === 'inProgress') return w.currentLevel !== 'MASTERED';
      return true;
    });
  }, [words, query, filter]);

  if (error) {
    return (
      <View style={styles.centered}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!words) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  const masteredCount = words.filter((w) => w.currentLevel === 'MASTERED').length;

  return (
    <View style={styles.container}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>My Words</Text>
      <Text style={styles.subtitle}>
        {words.length === 0
          ? 'Answer your first Quest word to start building this list.'
          : `${masteredCount} of ${words.length} mastered`}
      </Text>

      {words.length > 0 && (
        <>
          <TextInput
            style={styles.search}
            placeholder="Search your words"
            placeholderTextColor={colors.inkMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            accessibilityLabel="Search your words"
          />

          <View style={styles.filters}>
            <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} styles={styles} />
            <FilterChip
              label="In progress"
              active={filter === 'inProgress'}
              onPress={() => setFilter('inProgress')}
              styles={styles}
            />
            <FilterChip
              label="Mastered"
              active={filter === 'mastered'}
              onPress={() => setFilter('mastered')}
              styles={styles}
            />
          </View>
        </>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.wordId}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          words.length > 0 ? (
            <Text style={styles.emptyText}>No words match this filter.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <WordCard
            item={item}
            styles={styles}
            colors={colors}
            onPress={() => navigation.navigate('WordPractice', { wordId: item.wordId })}
          />
        )}
      />
    </View>
  );
}

function FilterChip({
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
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function weakestSkill(item: WordMasteryListItem): { label: string; score: number } | null {
  if (item.currentLevel === 'MASTERED') return null;
  const areas: { label: string; score: number }[] = [
    { label: 'Guess accuracy', score: item.guessScore },
    { label: 'Sentence practice', score: item.sentenceScore },
    { label: 'Paragraph practice', score: item.paragraphScore },
  ];
  return areas.reduce((weakest, area) => (area.score < weakest.score ? area : weakest));
}

function WordCard({
  item,
  styles,
  colors,
  onPress,
}: {
  item: WordMasteryListItem;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const mastered = item.currentLevel === 'MASTERED';
  const weakest = weakestSkill(item);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Practice ${item.word}`}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardWord}>{item.word}</Text>
        <View style={[styles.levelBadge, mastered && styles.levelBadgeMastered]}>
          <Text style={[styles.levelBadgeText, mastered && styles.levelBadgeTextMastered]}>
            {LEVEL_LABEL[item.currentLevel]}
          </Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        <ScoreChip label="Guess" score={item.guessScore} styles={styles} />
        <ScoreChip label="Sentence" score={item.sentenceScore} styles={styles} />
        <ScoreChip label="Paragraph" score={item.paragraphScore} styles={styles} />
      </View>

      <Text style={styles.cardMeta}>
        {item.timesCorrect}/{item.timesPresented} correct
      </Text>

      {weakest && weakest.score < MASTERY_THRESHOLD ? (
        <Text style={styles.improveText}>Improve: {weakest.label}</Text>
      ) : mastered ? (
        <Text style={styles.masteredText}>Mastered — every skill area cleared.</Text>
      ) : null}
    </Pressable>
  );
}

function ScoreChip({
  label,
  score,
  styles,
}: {
  label: string;
  score: number;
  styles: ReturnType<typeof createStyles>;
}) {
  const cleared = score >= MASTERY_THRESHOLD;
  return (
    <View style={styles.scoreChip}>
      <Text style={styles.scoreChipLabel}>{label}</Text>
      <Text style={[styles.scoreChipValue, cleared && styles.scoreChipValueCleared]}>{score}%</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.md,
      paddingTop: topInset + spacing.xl,
      gap: spacing.sm,
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
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm },
    search: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.ink,
      fontSize: typography.scale.md,
    },
    filters: { flexDirection: 'row', gap: spacing.xs },
    filterChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    filterChipActive: { backgroundColor: colors.arcane, borderColor: colors.arcane },
    filterChipText: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    filterChipTextActive: { color: colors.ink },
    list: { gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
    emptyText: {
      color: colors.inkMuted,
      fontSize: typography.scale.sm,
      textAlign: 'center',
      marginTop: spacing.xl,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    cardPressed: {
      opacity: 0.7,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardWord: {
      color: colors.ink,
      fontSize: typography.scale.lg,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    levelBadge: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    levelBadgeMastered: { backgroundColor: colors.glyph },
    levelBadgeText: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    levelBadgeTextMastered: { color: '#181233' },
    scoreRow: { flexDirection: 'row', gap: spacing.sm },
    scoreChip: { flex: 1, gap: 2 },
    scoreChipLabel: { color: colors.inkMuted, fontSize: typography.scale.xs },
    scoreChipValue: { color: colors.inkMuted, fontSize: typography.scale.sm, fontWeight: '700' },
    scoreChipValueCleared: { color: colors.success },
    cardMeta: { color: colors.inkMuted, fontSize: typography.scale.xs },
    improveText: { color: colors.warning, fontSize: typography.scale.xs, fontWeight: '700' },
    masteredText: { color: colors.glyph, fontSize: typography.scale.xs, fontWeight: '700' },
  });
}
