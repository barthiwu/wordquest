import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import {
  getBossBattleXpLeaderboard,
  getClanLeaderboard,
  getContinentLeaderboard,
  getCountryLeaderboard,
  getFriendLeaderboard,
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

type Category = 'global' | 'clan' | 'country' | 'continent' | 'friend' | 'bossBattle';

/** A player counts as "active" for the leaderboard row badge when their
 * last recorded activity (entry.lastActiveOn) falls within this many
 * milliseconds of now. This is a simple recency window on a raw instant,
 * not the player-local-calendar-day computation the streak system uses
 * (playerLocalDate) — precise-to-the-day accuracy isn't needed for a
 * lightweight "recently active" indicator on someone else's row. */
const ACTIVE_RECENTLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * §30 Leaderboards, now the Leaderboard tab. Global (Overall), Clan,
 * Country, Continent, Friend and Boss Battle are all real, ranked from
 * the same authoritative data as Home/Passport — Country and Continent
 * scope to the viewer's own countryCode (set via the onboarding flag
 * picker), same pattern as Clan scoping to the viewer's clan. Friend
 * ranks the viewer against their accepted friends (backend/src/friends),
 * and Boss Battle ranks by lifetime Boss Battle XP rather than general
 * totalXp — see Row below for how that category suppresses the
 * (meaningless, always-0) level in its subtitle.
 *
 * Global/Country/Continent were briefly trimmed out (Sept 2026, in
 * favor of Clan/Friend/Boss Battle only) and restored a couple of days
 * later (2026-09, Barth: wants to follow how people are progressing,
 * specifically calling out Overall and Country) — the backend endpoints
 * were never removed, so this was a UI-only restore. Barth used
 * "Overall" rather than "Global" when asking for it back, so that's
 * the English tab label now, though the underlying category/route name
 * (`global`, `/leaderboards/global`) is unchanged.
 */
// This screen no longer navigates anywhere (the standalone "play
// Boss Battle" CTA was removed once PlayScreen/Compete tab got its own
// entry point), so its screen props go unused; still typed as `Props` so
// it keeps matching the Tab.Screen signature React Navigation expects.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function LeaderboardScreen(_props: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('leaderboards');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [category, setCategory] = useState<Category>('global');
  const [view, setView] = useState<LeaderboardView | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Category-scoped copy needs the translated `t` function, so these
  // live inside the component rather than as module-level constants —
  // same maps, same keys, just built from t() each render.
  const categoryUnavailableMessage: Record<Category, string> = {
    global: t('unavailableGlobal'),
    clan: t('unavailableClan'),
    country: t('unavailableCountry'),
    continent: t('unavailableContinent'),
    friend: t('unavailableFriend'),
    bossBattle: t('unavailableBossBattle'),
  };

  const categoryEmptyMessage: Record<Category, string> = {
    global: t('emptyGlobal'),
    clan: t('emptyClan'),
    country: t('emptyCountry'),
    continent: t('emptyContinent'),
    friend: t('emptyFriend'),
    bossBattle: t('emptyBossBattle'),
  };

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
              : cat === 'continent'
                ? getContinentLeaderboard(accessToken)
                : cat === 'friend'
                  ? getFriendLeaderboard(accessToken)
                  : getBossBattleXpLeaderboard(accessToken);
      request.then(setView).catch((err) => {
        if (err instanceof ApiError && err.status === 400) {
          setError(categoryUnavailableMessage[cat]);
        } else {
          setError(t('genericError'));
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <Text style={styles.title}>{t('title')}</Text>

      <View style={styles.tabs}>
        <Tab
          label={t('tabGlobal')}
          active={category === 'global'}
          onPress={() => selectCategory('global')}
          styles={styles}
        />
        <Tab
          label={t('tabClan')}
          active={category === 'clan'}
          onPress={() => selectCategory('clan')}
          styles={styles}
        />
        <Tab
          label={t('tabCountry')}
          active={category === 'country'}
          onPress={() => selectCategory('country')}
          styles={styles}
        />
        <Tab
          label={t('tabContinent')}
          active={category === 'continent'}
          onPress={() => selectCategory('continent')}
          styles={styles}
        />
        <Tab
          label={t('tabFriend')}
          active={category === 'friend'}
          onPress={() => selectCategory('friend')}
          styles={styles}
        />
        <Tab
          label={t('tabBossBattle')}
          active={category === 'bossBattle'}
          onPress={() => selectCategory('bossBattle')}
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
          <Text style={styles.emptyText}>{categoryEmptyMessage[category]}</Text>
        </View>
      )}

      {view && (
        <>
          <FlatList
            data={view.entries}
            keyExtractor={(item) => item.userId}
            renderItem={({ item }) => (
              <Row
                entry={item}
                isViewer={item.userId === view.viewer.userId}
                showLevel={category !== 'bossBattle'}
                styles={styles}
                colors={colors}
                t={t}
              />
            )}
            contentContainerStyle={styles.list}
          />
          <View style={styles.viewerCard}>
            <Text style={styles.viewerRank}>#{view.viewer.rank}</Text>
            <View style={styles.viewerMeta}>
              <Text style={styles.viewerName}>{t('you')}</Text>
              <Text style={styles.viewerXp}>{t('xpValue', { xp: view.viewer.totalXp })}</Text>
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

/** True when `lastActiveOn` falls within ACTIVE_RECENTLY_WINDOW_MS of now. */
function isActiveRecently(lastActiveOn: string | null): boolean {
  if (!lastActiveOn) return false;
  const elapsed = Date.now() - new Date(lastActiveOn).getTime();
  return elapsed >= 0 && elapsed < ACTIVE_RECENTLY_WINDOW_MS;
}

function Row({
  entry,
  isViewer,
  showLevel,
  styles,
  colors,
  t,
}: {
  entry: LeaderboardEntry;
  isViewer: boolean;
  /** false for the Boss Battle category, where entry.level is always 0
   * and meaningless (Boss Battle XP isn't account level) — suppresses
   * just that part of the subtitle line rather than the whole row. */
  showLevel: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const activeRecently = isActiveRecently(entry.lastActiveOn);
  return (
    <View style={[styles.row, isViewer && styles.rowViewer]}>
      <Text style={styles.rowRank}>#{entry.rank}</Text>
      <View style={styles.rowMeta}>
        <View style={styles.rowNameLine}>
          {activeRecently && (
            <View
              style={[styles.activeDot, { backgroundColor: colors.success }]}
              accessibilityLabel={t('activeToday')}
            />
          )}
          <Text style={styles.rowName}>
            {entry.countryCode ? `${countryCodeToFlagEmoji(entry.countryCode) ?? ''} ` : ''}
            {entry.username}
          </Text>
        </View>
        <Text style={styles.rowSub}>
          {showLevel ? t('levelLabel', { level: entry.level }) : ''}
          {entry.clanName ? `${showLevel ? ' · ' : ''}${entry.clanName}` : ''}
        </Text>
      </View>
      <Text style={styles.rowXp}>{t('xpValue', { xp: entry.totalXp })}</Text>
      {!isViewer && (
        <ReportButton targetType="USER" targetId={entry.userId} label={entry.username} />
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
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    error: { color: colors.danger, fontSize: typography.scale.md, textAlign: 'center' },
    emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm, textAlign: 'center' },
    tabs: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
    tab: {
      flexBasis: '30%',
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
    rowRank: {
      color: colors.inkMuted,
      fontSize: typography.scale.md,
      fontWeight: '700',
      width: 36,
    },
    rowMeta: { flex: 1, gap: 2 },
    rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    activeDot: { width: 8, height: 8, borderRadius: 4 },
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
