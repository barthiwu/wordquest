import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { listMyWordMastery, type WordMasteryListItem } from '@/services/users';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import { WordMasteryCard } from '@/components/WordMasteryCard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'WordMastery'>;

type Filter = 'all' | 'inProgress' | 'mastered';

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
  const { t } = useTranslation('wordMastery');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [words, setWords] = useState<WordMasteryListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    if (!accessToken) return;
    listMyWordMastery(accessToken)
      .then(setWords)
      .catch(() => setError(t('loadError')));
  }, [accessToken, t]);

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
      <Text style={styles.title}>{t('title')}</Text>
      <Text style={styles.subtitle}>
        {words.length === 0
          ? t('emptySubtitle')
          : t('masteredSubtitle', { mastered: masteredCount, total: words.length })}
      </Text>

      {words.length > 0 && (
        <>
          <TextInput
            style={styles.search}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor={colors.inkMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            accessibilityLabel={t('searchPlaceholder')}
          />

          <View style={styles.filters}>
            <FilterChip
              label={t('filterAll')}
              active={filter === 'all'}
              onPress={() => setFilter('all')}
              styles={styles}
            />
            <FilterChip
              label={t('filterInProgress')}
              active={filter === 'inProgress'}
              onPress={() => setFilter('inProgress')}
              styles={styles}
            />
            <FilterChip
              label={t('filterMastered')}
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
          words.length > 0 ? <Text style={styles.emptyText}>{t('noMatches')}</Text> : null
        }
        renderItem={({ item }) => (
          <WordMasteryCard
            item={item}
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
  });
}
