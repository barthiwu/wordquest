import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '@/constants/theme';
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
        .catch(() => setError('Could not search words.'))
        .finally(() => setLoading(false));
    },
    [accessToken],
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
      setError('Could not start a mission for that word.');
    } finally {
      setStartingWordId(null);
    }
  };

  return (
    <View style={styles.container}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Word in the Wild</Text>
      <Text style={styles.subtitle}>
        Pick a word you’ve genuinely encountered out in the world.
      </Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search words..."
        placeholderTextColor={colors.inkMuted}
        value={query}
        onChangeText={onChangeQuery}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search words"
      />

      {loading && <ActivityIndicator color={colors.arcaneSoft} style={styles.spinner} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && !error && results.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {query.trim().length === 0
              ? 'Start typing a word to find one you can submit evidence for.'
              : `No words match “${query.trim()}” — try a different search.`}
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
            accessibilityLabel={`Start mission for ${item.word}`}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
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
