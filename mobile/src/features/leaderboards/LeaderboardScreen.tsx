import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '@/constants/theme';
import {
  getClanLeaderboard,
  getGlobalLeaderboard,
  type LeaderboardEntry,
  type LeaderboardView,
} from '@/services/leaderboards';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '@/app/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Compete'>,
  NativeStackScreenProps<RootStackParamList>
>;

type Category = 'global' | 'clan';

/**
 * §30 Leaderboards, now the Compete tab (Boss Battles joins this tab
 * later — build order §47 item 26). Global and Clan are real, ranked
 * from the same authoritative data as Home/Passport. Friends isn't
 * shown as a third category — there's no friends graph in WordQuest
 * yet, and a category that always renders empty would look broken
 * rather than honestly unbuilt.
 */
export function LeaderboardScreen({ navigation }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [category, setCategory] = useState<Category>('global');
  const [view, setView] = useState<LeaderboardView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (cat: Category) => {
      if (!accessToken) return;
      setView(null);
      setError(null);
      const request =
        cat === 'global' ? getGlobalLeaderboard(accessToken) : getClanLeaderboard(accessToken);
      request.then(setView).catch((err) => {
        setError(
          err instanceof ApiError && err.status === 400
            ? 'Join a clan to see the clan leaderboard.'
            : 'Could not load the leaderboard.',
        );
      });
    },
    [accessToken],
  );

  useFocusEffect(
    useCallback(() => {
      load(category);
    }, [load, category]),
  );

  const selectCategory = (cat: Category) => {
    setCategory(cat);
    load(cat);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>

      <Pressable
        style={styles.bossBattleButton}
        onPress={() => navigation.navigate('BossBattle')}
        accessibilityRole="button"
        accessibilityLabel="Boss Battle"
      >
        <Text style={styles.bossBattleButtonText}>Boss Battle</Text>
      </Pressable>

      <View style={styles.tabs}>
        <Tab
          label="Global"
          active={category === 'global'}
          onPress={() => selectCategory('global')}
        />
        <Tab label="Clan" active={category === 'clan'} onPress={() => selectCategory('clan')} />
      </View>

      {!view && !error && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.arcaneSoft} />
        </View>
      )}

      {error && (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}

      {view && view.entries.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {category === 'clan' ? 'No one in your clan has ranked yet.' : 'No one has ranked yet.'}
          </Text>
        </View>
      )}

      {view && (
        <>
          <FlatList
            data={view.entries}
            keyExtractor={(item) => item.userId}
            renderItem={({ item }) => (
              <Row entry={item} isViewer={item.userId === view.viewer.userId} />
            )}
            contentContainerStyle={styles.list}
          />
          <View style={styles.viewerCard}>
            <Text style={styles.viewerRank}>#{view.viewer.rank}</Text>
            <View style={styles.viewerMeta}>
              <Text style={styles.viewerName}>You</Text>
              <Text style={styles.viewerXp}>{view.viewer.totalXp} XP</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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

function Row({ entry, isViewer }: { entry: LeaderboardEntry; isViewer: boolean }) {
  return (
    <View style={[styles.row, isViewer && styles.rowViewer]}>
      <Text style={styles.rowRank}>#{entry.rank}</Text>
      <View style={styles.rowMeta}>
        <Text style={styles.rowName}>{entry.displayName}</Text>
        <Text style={styles.rowSub}>
          Lvl {entry.level}
          {entry.clanName ? ` · ${entry.clanName}` : ''}
        </Text>
      </View>
      <Text style={styles.rowXp}>{entry.totalXp} XP</Text>
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
  bossBattleButton: {
    backgroundColor: colors.arcane,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  bossBattleButtonText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, fontSize: typography.scale.md, textAlign: 'center' },
  emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
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
  list: { gap: spacing.sm, paddingBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  rowViewer: { borderColor: colors.arcaneSoft },
  rowRank: { color: colors.inkMuted, fontSize: typography.scale.md, fontWeight: '700', width: 36 },
  rowMeta: { flex: 1, gap: 2 },
  rowName: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  rowSub: { color: colors.inkMuted, fontSize: typography.scale.xs },
  rowXp: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
  viewerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.arcaneSoft,
    padding: spacing.md,
  },
  viewerRank: {
    color: colors.arcaneSoft,
    fontSize: typography.scale.lg,
    fontWeight: typography.display.weight,
  },
  viewerMeta: { flex: 1, gap: 2 },
  viewerName: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  viewerXp: { color: colors.glyph, fontSize: typography.scale.sm, fontWeight: '700' },
});
