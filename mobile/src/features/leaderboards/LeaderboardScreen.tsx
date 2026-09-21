import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  getClanLeaderboard,
  getContinentLeaderboard,
  getCountryLeaderboard,
  getGlobalLeaderboard,
  type LeaderboardEntry,
  type LeaderboardView,
} from '@/services/leaderboards';
import { ApiError } from '@/services/apiClient';
import { useAuthStore } from '@/state/authStore';
import { countryCodeToFlagEmoji } from '@/utils/countryFlag';
import { ReportButton } from '@/components/ReportButton';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '@/app/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Compete'>,
  NativeStackScreenProps<RootStackParamList>
>;

type Category = 'global' | 'clan' | 'country' | 'continent';

const CATEGORY_UNAVAILABLE_MESSAGE: Record<Category, string> = {
  global: 'Could not load the leaderboard.',
  clan: 'Join a clan to see the clan leaderboard.',
  country: 'Set your country in your profile to see the country leaderboard.',
  continent: 'Set your country in your profile to see the continent leaderboard.',
};

const CATEGORY_EMPTY_MESSAGE: Record<Category, string> = {
  global: 'No one has ranked yet.',
  clan: 'No one in your clan has ranked yet.',
  country: 'No one from your country has ranked yet.',
  continent: 'No one from your continent has ranked yet.',
};

/**
 * §30 Leaderboards, now the Compete tab (Boss Battles joins this tab
 * later — build order §47 item 26). Global, Clan, Country and
 * Continent are all real, ranked from the same authoritative data as
 * Home/Passport — Country and Continent scope to the viewer's own
 * countryCode (set via the onboarding flag picker), same pattern as
 * Clan scoping to the viewer's clan. Friends isn't shown as a fifth
 * category — there's no friends graph in WordQuest yet, and a
 * category that always renders empty would look broken rather than
 * honestly unbuilt.
 */
export function LeaderboardScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
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
        cat === 'global'
          ? getGlobalLeaderboard(accessToken)
          : cat === 'clan'
            ? getClanLeaderboard(accessToken)
            : cat === 'country'
              ? getCountryLeaderboard(accessToken)
              : getContinentLeaderboard(accessToken);
      request.then(setView).catch((err) => {
        if (err instanceof ApiError && err.status === 400) {
          setError(CATEGORY_UNAVAILABLE_MESSAGE[cat]);
        } else {
          setError('Could not load the leaderboard.');
        }
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
          styles={styles}
        />
        <Tab
          label="Clan"
          active={category === 'clan'}
          onPress={() => selectCategory('clan')}
          styles={styles}
        />
        <Tab
          label="Country"
          active={category === 'country'}
          onPress={() => selectCategory('country')}
          styles={styles}
        />
        <Tab
          label="Continent"
          active={category === 'continent'}
          onPress={() => selectCategory('continent')}
          styles={styles}
        />
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
          <Text style={styles.emptyText}>{CATEGORY_EMPTY_MESSAGE[category]}</Text>
        </View>
      )}

      {view && (
        <>
          <FlatList
            data={view.entries}
            keyExtractor={(item) => item.userId}
            renderItem={({ item }) => (
              <Row entry={item} isViewer={item.userId === view.viewer.userId} styles={styles} />
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

function Tab({
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

function Row({
  entry,
  isViewer,
  styles,
}: {
  entry: LeaderboardEntry;
  isViewer: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.row, isViewer && styles.rowViewer]}>
      <Text style={styles.rowRank}>#{entry.rank}</Text>
      <View style={styles.rowMeta}>
        <Text style={styles.rowName}>
          {entry.countryCode ? `${countryCodeToFlagEmoji(entry.countryCode) ?? ''} ` : ''}
          {entry.displayName}
        </Text>
        <Text style={styles.rowSub}>
          Lvl {entry.level}
          {entry.clanName ? ` · ${entry.clanName}` : ''}
        </Text>
      </View>
      <Text style={styles.rowXp}>{entry.totalXp} XP</Text>
      {!isViewer && (
        <ReportButton targetType="USER" targetId={entry.userId} label={entry.displayName} />
      )}
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
  tabs: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  tab: {
    flexBasis: '23%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.arcane, borderColor: colors.arcane },
  tabText: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '700' },
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
}
