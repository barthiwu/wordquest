import { Fragment, type ComponentType, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useIsNewLook } from '@/state/uiVersionStore';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { ResponsiveContainer } from '@/components/layout/ResponsiveContainer';
import {
  listQuests,
  getTodayQuestSummary,
  type QuestCatalogEntry,
  type TodayQuestSummary,
} from '@/services/quests';
import { getUpcomingBattle, type UpcomingBattle } from '@/services/bossBattle';
import { useAuthStore } from '@/state/authStore';
import { formatLocalClock, timeOfDayPeriod } from '@/utils/timeOfDay';
import { formatBossBattleCountdown } from '@/utils/bossBattleCountdown';
import { CompleteItIcon, ScrambleQuestIcon, WordDuelIcon } from '@/components/ArcadeGameIcons';
import { FirstTimeTip } from '@/components/FirstTimeTip';
import { trackEvent } from '@/services/analyticsClient';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '@/app/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Play'>,
  NativeStackScreenProps<RootStackParamList>
>;

interface PlayQuestEntry {
  key: string;
  title: string;
  windowStartHour: number | null;
  windowEndHour: number | null;
  completed: boolean;
}

/**
 * The Play tab — replaces the old flat-list Quest tab (moved to
 * features/quests/_to_delete/QuestScreen.tsx; Barth can delete that
 * folder once he's synced). Sept 2026 chess.com-inspired consolidation
 * (Barth's Play/Play-page/"Choose Time" screenshots): ONE primary card
 * shows the Daily Quest for whichever time-of-day window is current
 * right now, with a dropdown chevron to switch to either of the other
 * two windows — mirroring chess.com's time-control picker exactly,
 * since WordQuest's three quest windows (00:00/12:00/16:00, seed.ts)
 * line up one-to-one with timeOfDayPeriod's Morning/Afternoon/Evening
 * boundaries. Below that, every other "play something" destination
 * WordQuest has — ScrambleQuest, Word Duel, Complete It, Boss Battle —
 * in one flat list, Boss Battle last with its countdown, exactly
 * matching the screenshots (Play -> one primary mode + everything else
 * below it). Each destination is a normal root-stack push, so its own
 * back button already returns here — no special "return to Play"
 * plumbing needed.
 *
 * Default primary selection: the current window if it's not done yet;
 * otherwise the earliest unlocked window the player HASN'T finished
 * ("pick which one you haven't done yet" — Barth's own words for what
 * the dropdown is for); otherwise the current window anyway (fully
 * caught up today). This only runs once per fresh load — switching
 * windows via the dropdown is a deliberate player choice that a
 * background clock tick must never override.
 */
export function PlayScreen({ navigation }: Props) {
  const { t } = useTranslation(['play', 'quests', 'arcade', 'home', 'common']);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const newLook = useIsNewLook();
  const bp = useBreakpoint();
  const wide = newLook && !bp.isMobile;

  const [catalog, setCatalog] = useState<QuestCatalogEntry[] | null>(null);
  const [summary, setSummary] = useState<TodayQuestSummary | null>(null);
  const [upcomingBattle, setUpcomingBattle] = useState<UpcomingBattle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Telemetry spec §11: ARCADE_OPENED fires once per mount (not on every
  // tab refocus -- see useFocusEffect(load) below, which re-fetches data
  // but isn't a fresh "opened the hub" from the player's perspective).
  useEffect(() => {
    trackEvent('ARCADE_OPENED');
  }, []);

  const selectGame = (
    game: string,
    screen: 'ScrambleQuest' | 'WordDuel' | 'CompleteIt' | 'BossBattle',
  ) => {
    trackEvent('ARCADE_GAME_SELECTED', { game });
    navigation.navigate(screen);
  };

  const load = useCallback(() => {
    if (!accessToken) return;
    listQuests(accessToken)
      .then(setCatalog)
      .catch(() => setError(t('play:loadError')));
    getTodayQuestSummary(accessToken)
      .then(setSummary)
      .catch(() => {});
    getUpcomingBattle(accessToken)
      .then(setUpcomingBattle)
      .catch(() => {});
  }, [accessToken, t]);

  useFocusEffect(load);

  // Same 15s local-clock tick QuestScreen used to run — plenty for the
  // window-unlock boundary to flip on its own while this screen is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(interval);
  }, []);
  const localHour = now.getHours();

  const quests: PlayQuestEntry[] = useMemo(() => {
    if (!catalog) return [];
    const completedKeys = new Set(
      (summary?.quests ?? []).filter((q) => q.completed).map((q) => q.key),
    );
    return catalog.map((q) => ({
      key: q.key,
      title: q.title,
      windowStartHour: q.windowStartHour,
      windowEndHour: q.windowEndHour,
      completed: completedKeys.has(q.key),
    }));
  }, [catalog, summary]);

  const isLocked = useCallback(
    (quest: PlayQuestEntry) => quest.windowStartHour !== null && localHour < quest.windowStartHour,
    [localHour],
  );

  useEffect(() => {
    if (selectedKey !== null || quests.length === 0) return;
    const unlocked = quests.filter((q) => !isLocked(q));
    if (unlocked.length === 0) {
      setSelectedKey(quests[0].key);
      return;
    }
    const current = [...unlocked].sort(
      (a, b) => (b.windowStartHour ?? -1) - (a.windowStartHour ?? -1),
    )[0];
    const undone = unlocked.find((q) => !q.completed);
    setSelectedKey(!current.completed ? current.key : undone ? undone.key : current.key);
  }, [quests, isLocked, selectedKey]);

  const selected = quests.find((q) => q.key === selectedKey) ?? null;
  const otherQuests = quests.filter((q) => q.key !== selectedKey);
  const allDone = quests.length > 0 && quests.every((q) => q.completed);

  const battleCountdown = upcomingBattle
    ? formatBossBattleCountdown(upcomingBattle.scheduledStartUtc, upcomingBattle.status)
    : null;

  const questBlock = (
    <>
      {selected && (
        <View style={styles.primaryCard}>
          <Pressable
            style={styles.primaryHeader}
            onPress={() => setDropdownOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={t('play:dropdownToggleAccessibilityLabel')}
          >
            <View style={styles.primaryHeaderTextCol}>
              <Text style={styles.primaryTitle}>{selected.title}</Text>
              {selected.windowStartHour !== null && (
                <Text style={styles.primaryWindow}>
                  {String(selected.windowStartHour).padStart(2, '0')}:00
                  {selected.windowEndHour !== null
                    ? `-${String(selected.windowEndHour).padStart(2, '0')}:59`
                    : ''}
                </Text>
              )}
            </View>
            <Ionicons
              name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.inkMuted}
            />
          </Pressable>

          {dropdownOpen && otherQuests.length > 0 && (
            <View style={styles.dropdown}>
              <Text style={styles.dropdownLabel}>{t('play:otherQuestsLabel')}</Text>
              {otherQuests.map((quest) => {
                const locked = isLocked(quest);
                const unlockTime = `${String(quest.windowStartHour).padStart(2, '0')}:00`;
                return (
                  <Pressable
                    key={quest.key}
                    style={[styles.dropdownRow, locked && styles.dropdownRowLocked]}
                    disabled={locked}
                    onPress={() => {
                      setSelectedKey(quest.key);
                      setDropdownOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      locked
                        ? t('quests:unlocksAtAccessibilityLabel', {
                            title: quest.title,
                            time: unlockTime,
                          })
                        : quest.completed
                          ? t('play:completedAccessibilityLabel', { title: quest.title })
                          : t('play:selectQuestAccessibilityLabel', { title: quest.title })
                    }
                  >
                    <Text style={styles.dropdownRowTitle}>{quest.title}</Text>
                    <Text style={styles.dropdownRowStatus}>
                      {locked
                        ? t('quests:unlocksAt', { time: unlockTime })
                        : quest.completed
                          ? t('play:completedBadge')
                          : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {selected.completed ? (
            <View style={[styles.startButton, styles.startButtonDone]}>
              <Text style={[styles.startButtonText, styles.startButtonTextDone]}>
                {t('play:completedBadge')}
              </Text>
            </View>
          ) : (
            <Pressable
              style={styles.startButton}
              onPress={() => navigation.navigate('DailyQuest', { questKey: selected.key })}
              accessibilityRole="button"
              accessibilityLabel={t('quests:startAccessibilityLabel', { title: selected.title })}
            >
              <Text style={styles.startButtonText}>{t('play:startQuest')}</Text>
            </Pressable>
          )}

          {allDone && <Text style={styles.allDoneText}>{t('play:allDoneToday')}</Text>}
        </View>
      )}

    </>
  );

  const gamesBlock = (
    <View style={[styles.gamesBlock, wide && styles.gamesGrid]}>
      <GameRow
        title={t('arcade:scrambleQuestTitle')}
        subtitle={t('arcade:scrambleQuestSubtitle')}
        cta={t('arcade:play')}
        enabled
        onPress={() => selectGame('SCRAMBLE_QUEST', 'ScrambleQuest')}
        icon={<ScrambleQuestIcon colors={colors} />}
        styles={styles}
        grid={wide}
      />
      <GameRow
        title={t('arcade:wordDuelTitle')}
        subtitle={t('arcade:wordDuelSubtitle')}
        cta={t('arcade:play')}
        enabled
        onPress={() => selectGame('WORD_DUEL', 'WordDuel')}
        icon={<WordDuelIcon colors={colors} />}
        styles={styles}
        grid={wide}
      />
      <GameRow
        title={t('arcade:completeItTitle')}
        subtitle={t('arcade:completeItSubtitle')}
        cta={t('arcade:play')}
        enabled
        onPress={() => selectGame('COMPLETE_IT', 'CompleteIt')}
        icon={<CompleteItIcon colors={colors} />}
        styles={styles}
        grid={wide}
      />
      <GameRow
        title={t('home:bossBattle')}
        subtitle={t('play:bossBattleSubtitle')}
        cta={t('arcade:play')}
        enabled
        onPress={() => selectGame('BOSS_BATTLE', 'BossBattle')}
        badge={battleCountdown?.compact}
        badgeSubtext={battleCountdown?.subtitle}
        styles={styles}
        grid={wide}
      />

    </View>
  );

  const Wrapper: ComponentType<any> = newLook ? ResponsiveContainer : Fragment;

  return (
    <ScrollView contentContainerStyle={[styles.container, newLook && styles.containerNew]}>
      <Wrapper {...(newLook ? { style: styles.hubStack } : {})}>
      <Text style={styles.title}>{newLook ? t('common:tabs.play') : t('play:title')}</Text>
      {newLook && <Text style={styles.subtitle}>{t('arcade:subtitle')}</Text>}

      <FirstTimeTip
        id="play.intro"
        colors={colors}
        icon="compass-outline"
        title={t('play:tipTitle')}
        body={t('play:tipBody')}
      />

      {!catalog && !error && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.arcaneSoft} />
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {catalog && quests.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('quests:emptyState')}</Text>
        </View>
      )}

      {wide ? (
        <View style={styles.hubRow}>
          <View style={styles.hubQuestCol}>{questBlock}</View>
          <View style={styles.hubGamesCol}>{gamesBlock}</View>
        </View>
      ) : (
        <>
          {questBlock}
          {gamesBlock}
        </>
      )}

      <Text style={styles.deviceTime}>
        {t('quests:localTime', { period: timeOfDayPeriod(now), clock: formatLocalClock(now) })}
      </Text>
      </Wrapper>
    </ScrollView>
  );
}

function GameRow({
  title,
  subtitle,
  cta,
  enabled,
  onPress,
  icon,
  badge,
  badgeSubtext,
  styles,
  grid,
}: {
  title: string;
  subtitle: string;
  cta: string;
  enabled: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
  badge?: string;
  badgeSubtext?: string;
  styles: ReturnType<typeof createStyles>;
  grid?: boolean;
}) {
  return (
    <Pressable
      style={[styles.card, grid && styles.cardGrid, !enabled && styles.cardDisabled]}
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {icon}
      <View style={styles.cardTextCol}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      {badge && (
        <View style={styles.cardCountdownCol}>
          <View style={styles.cardCountdownBadge}>
            <Text style={styles.cardCountdownBadgeText}>{badge}</Text>
          </View>
          {badgeSubtext && <Text style={styles.cardCountdownSubtext}>{badgeSubtext}</Text>}
        </View>
      )}
      <View style={[styles.cardCta, !enabled && styles.cardCtaDisabled]}>
        <Text style={[styles.cardCtaText, !enabled && styles.cardCtaTextDisabled]}>{cta}</Text>
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      paddingTop: topInset + spacing.xl,
      gap: spacing.md,
    },
    containerNew: { paddingHorizontal: spacing.md },
    subtitle: { color: colors.inkMuted, fontSize: typography.scale.md },
    hubStack: { gap: spacing.md },
    hubRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
    hubQuestCol: { flex: 2, gap: spacing.md },
    hubGamesCol: { flex: 3 },
    gamesBlock: { gap: spacing.md },
    gamesGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    cardGrid: {
      flexGrow: 1,
      flexBasis: 260,
      minWidth: 0,
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: spacing.sm,
    },
    centered: { alignItems: 'center', paddingVertical: spacing.xl },
    empty: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    emptyText: { color: colors.inkMuted, fontSize: typography.scale.sm },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    error: { color: colors.danger, fontSize: typography.scale.md },
    primaryCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.md,
    },
    primaryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    primaryHeaderTextCol: { flex: 1, gap: 2 },
    primaryTitle: { color: colors.arcaneSoft, fontSize: typography.scale.lg, fontWeight: '700' },
    primaryWindow: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    dropdown: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      padding: spacing.sm,
      gap: spacing.xs,
    },
    dropdownLabel: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    dropdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
    },
    dropdownRowLocked: { opacity: 0.5 },
    dropdownRowTitle: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '600' },
    dropdownRowStatus: { color: colors.inkMuted, fontSize: typography.scale.xs },
    startButton: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    startButtonDone: { backgroundColor: colors.surfaceRaised },
    startButtonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    startButtonTextDone: { color: colors.success },
    allDoneText: { color: colors.inkMuted, fontSize: typography.scale.xs, textAlign: 'center' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    cardDisabled: { opacity: 0.6 },
    cardTextCol: { flex: 1, gap: spacing.xs },
    cardTitle: { color: colors.ink, fontSize: typography.scale.lg, fontWeight: '700' },
    cardSubtitle: { color: colors.inkMuted, fontSize: typography.scale.sm },
    cardCountdownCol: { alignItems: 'flex-end', gap: 2 },
    cardCountdownBadge: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1,
    },
    cardCountdownBadgeText: { color: colors.inkMuted, fontSize: 10, fontWeight: '700' },
    cardCountdownSubtext: { color: colors.inkMuted, fontSize: 10 },
    cardCta: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    cardCtaDisabled: { backgroundColor: colors.surfaceRaised },
    cardCtaText: { color: colors.ink, fontSize: typography.scale.sm, fontWeight: '700' },
    cardCtaTextDisabled: { color: colors.inkMuted },
    deviceTime: { color: colors.inkMuted, fontSize: typography.scale.xs, textAlign: 'center' },
  });
}
