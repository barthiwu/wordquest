import { useCallback, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { searchWords, type WordSearchResult } from '@/services/words';
import { createMission } from '@/services/word-in-the-wild';
import { useAuthStore } from '@/state/authStore';
import { BackButton } from '@/components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'WordInTheWild'>;

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Vocabulary Engine spec v2 WL-07: find a word genuinely used somewhere
 * real, then submit evidence. This screen is just the word picker — the
 * actual evidence flow is SubmitEvidenceScreen, reached after a mission
 * is created for the chosen word.
 */
export function WordInTheWildScreen({ navigation }: Props) {
  const { t } = useTranslation('wordInTheWild');
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WordSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingWordId, setStartingWordId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    (text: string) => {
      if (!accessToken) return;
      setLoading(true);
      setError(null);
      searchWords(accessToken, text)
        .then(setResults)
        .catch(() => setError(t('searchError')))
        .finally(() => setLoading(false));
    },
    [accessToken, t],
  );

  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), SEARCH_DEBOUNCE_MS);
  };

  const onPickWord = async (word: WordSearchResult) => {
    if (!accessToken) return;
    setStartingWordId(word.id);
    setError(null);
    try {
      const mission = await createMission(accessToken, word.id);
      navigation.navigate('SubmitEvidence', {
        missionId: mission.id,
        word: mission.word,
        definition: mission.definition,
      });
    } catch {
      setError(t('missionError'));
    } finally {
      setStartingWordId(null);
    }
  };

  return (
    <View style={styles.container}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('title')}</Text>
      <Text style={styles.subtitle}>{t('subtitle')}</Text>

      <TextInput
        style={styles.searchInput}
        placeholder={t('searchPlaceholder')}
        placeholderTextColor={colors.inkMuted}
        value={query}
        onChangeText={onChangeQuery}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={t('searchAccessibilityLabel')}
      />

      {loading && <ActivityIndicator color={colors.arcaneSoft} style={styles.spinner} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && !error && results.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {query.trim().length === 0 ? t('emptyPrompt') : t('noMatches', { query: query.trim() })}
          </Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.resultRow}
            onPress={() => onPickWord(item)}
            disabled={startingWordId !== null}
            accessibilityRole="button"
            accessibilityLabel={t('startMissionAccessibilityLabel', { word: item.word })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.resultWord}>{item.word}</Text>
              <Text style={styles.resultDefinition} numberOfLines={1}>
                {item.definition}
              </Text>
            </View>
            {startingWordId === item.id && <ActivityIndicator color={colors.arcaneSoft} />}
          </Pressable>
        )}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.xl,
      gap: spacing.md,
    },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.sm },
    searchInput: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.ink,
      fontSize: typography.scale.md,
    },
    spinner: { marginTop: spacing.sm },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    empty: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    list: { gap: spacing.sm },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    resultWord: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    resultDefinition: { color: colors.inkMuted, fontSize: typography.scale.xs },
  });
}
