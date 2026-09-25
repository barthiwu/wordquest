import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { getMyProgression, type Progression } from '@/services/progression';
import { getMyJourney, type JourneyView } from '@/services/journey';
import { getTodayQuestSummary, type TodayQuestSummary } from '@/services/quests';
import { getClanLeaderboard, type LeaderboardEntry } from '@/services/leaderboards';
import { listMyWordMastery, type WordMasteryListItem } from '@/services/users';
import { getUpcomingBattle, type UpcomingBattle } from '@/services/bossBattle';
import { useAuthStore } from '@/state/authStore';
import { timeOfDayGreeting } from '@/utils/timeOfDay';
import { formatBossBattleCountdown } from '@/utils/bossBattleCountdown';
import { VerificationBanner } from '@/components/VerificationBanner';
import { GlyphCoin } from '@/components/GlyphIcon';
import { StreakMilestoneRibbon } from '@/components/StreakMilestoneRibbon';
import { DailyGoalsCard } from '@/components/DailyGoalsCard';
import { ClanRankCard } from '@/components/ClanRankCard';
import { StagePathRail } from '@/components/StagePathRail';
import { WordMasteryCard } from '@/components/WordMasteryCard';
import { JourneyMotif } from '@/components/JourneyMotif';
import { journeyVisualFor } from '@/constants/journeyVisuals';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '@/app/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

const MONTH_ABBR = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/**
 * Screen 19 of the UI/UX Screen Bible, the Home tab — rebuilt for the
 * Sept 2026 homepage redesign (Design canvas "WordQuest Homepage
 * Directions", mockup B1 Refined, approved after several rounds of
 * review). Every number on this screen still comes from the same real
 * endpoints Home always used, plus one new read-only one
 * (getTodayQuestSummary — see backend QuestsService.getTodaySummary):
 * nothing about progression, streaks, quests, clans, mastery, or Boss
 * Battle timing changed, only how Home presents them. Two deliberate
 * departures from the approved mockup, both explained where they render
 * below: the Daily Goals card has two rings instead of three (no real
 * daily-XP target exists to back the third), and the old six-tile stat
 * grid is gone (superseded by the quick-link row, the Free Practice
 * section, and Passport, which already owns that detail).
 *
 * Refetches everything on focus, same as before — always the server's
 * snapshot, never a locally incremented guess. A failed progression
 * fetch is the one page-level error (it's the one thing every other
 * card either needs or complements); every other fetch fails quietly
 * and just leaves its own card empty, same pattern VerificationBanner
 * and the old Journey excerpt already used.
 *
 * i18n note: MONTH_ABBR (the date badge, e.g. "SEP/24") and the two
 * date/time-of-day utility helpers below (timeOfDayGreeting,
 * formatBossBattleCountdown) are intentionally NOT translated in this
 * pass — they're plain functions outside any component, so translating
 * them needs the global i18n.t() rather than this screen's useTranslation
 * hook. Tracked as separate follow-up work, not silently shipped broken.
 */
export function HomeScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('home');
  const accessToken = useAuthStore((s) => s.accessToken);
  const displayName = useAuthStore((s) => s.user?.displayName);
  const avatarUrl = useAuthStore((s) => s.user?.avatarUrl);

  const [progression, setProgression] = useState<Progression | null>(null);
  const [journey, setJourney] = useState<JourneyView | null>(null);
  const [todaySummary, setTodaySummary] = useState<TodayQuestSummary | null>(null);
  const [clanViewer, setClanViewer] = useState<LeaderboardEntry | null>(null);
  const [wordMastery, setWordMastery] = useState<WordMasteryListItem[] | null>(null);
  const [upcomingBattle, setUpcomingBattle] = useState<UpcomingBattle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getMyProgression(accessToken)
      .then(setProgression)
      .catch(() => setError(t('errorGeneric')));
    getMyJourney(accessToken)
      .then(setJourney)
      .catch(() => {});
    getTodayQuestSummary(accessToken)
      .then(setTodaySummary)
      .catch(() => {});
    getClanLeaderboard(accessToken)
      .then((view) => setClanViewer(view.viewer))
      .catch(() => {});
    listMyWordMastery(accessToken)
      .then(setWordMastery)
      .catch(() => {});
    getUpcomingBattle(accessToken)
      .then(setUpcomingBattle)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(load, [load]);
  useFocusEffect(load);

  const initial = (displayName?.trim()?.[0] ?? '?').toUpperCase();
  const today = new Date();
  const dateBadge = `${MONTH_ABBR[today.getMonth()]}/${String(today.getDate()).padStart(2, '0')}`;

  const wordsRemaining = todaySummary
    ? Math.max(0, todaySummary.totalCount - todaySummary.completedCount)
    : null;
  // Same "has today's activity landed yet" signal DailyGoalsCard uses for
  // its streak ring -- the header flame dims in lockstep with it rather
  // than just reflecting currentStreak > 0, so a streak that's actually
  // at risk today doesn't still look "lit" and safe.
  const streakSafeToday = (todaySummary?.completedCount ?? 0) > 0;
  const chapterVisual = journey ? journeyVisualFor(journey.currentStage.key) : null;

  const battleCountdown = upcomingBattle
    ? formatBossBattleCountdown(upcomingBattle.scheduledStartUtc, upcomingBattle.status)
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.identityRow}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        )}
        <Text style={styles.greeting}>
          {timeOfDayGreeting()}
          {displayName ? `, ${displayName}` : ''}
        </Text>
        {progression && (
          <View style={styles.pillRow}>
            <View style={[styles.pill, streakSafeToday && styles.pillGlow]}>
              <Ionicons
                name="flame"
                size={14}
                color={streakSafeToday ? colors.warning : colors.inkMuted}
              />
              <Text
                style={[
                  styles.pillText,
                  { color: streakSafeToday ? colors.warning : colors.inkMuted },
                ]}
              >
                {progression.currentStreak}
              </Text>
            </View>
            <View style={styles.pill}>
              <GlyphCoin size={16} />
              <Text style={[styles.pillText, { color: colors.glyph }]}>
                {progression.glyphBalance}
              </Text>
            </View>
          </View>
        )}
      </View>

      {progression && <StreakMilestoneRibbon currentStreak={progression.currentStreak} />}

      <VerificationBanner onPress={() => navigation.navigate('Settings')} />

      {!progression && !error && <ActivityIndicator color={colors.arcaneSoft} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {journey && (
        <Pressable
          style={[styles.chapterCard, { borderColor: chapterVisual?.color ?? colors.border }]}
          onPress={() => navigation.navigate('Main', { screen: 'Quest' })}
          accessibilityRole="button"
          accessibilityLabel={`${t('todaysChapter')}: ${journey.currentStage.name}`}
        >
          {chapterVisual && (
            <JourneyMotif icons={chapterVisual.motif} color={chapterVisual.color} />
          )}
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{dateBadge}</Text>
          </View>
          <View style={styles.chapterBody}>
            <Text style={styles.chapterEyebrow}>{t('todaysChapter')}</Text>
            <Text style={[styles.chapterName, { color: chapterVisual?.color ?? colors.ink }]}>
              {journey.currentStage.name}
            </Text>
            <Text style={styles.chapterSubtitle}>
              {wordsRemaining === null
                ? ' '
                : wordsRemaining > 0
                  ? t('wordsRemaining', { count: wordsRemaining })
                  : t('allCaughtUp')}
            </Text>
          </View>
          <View style={styles.chapterButton}>
            <Text style={styles.chapterButtonText}>
              {wordsRemaining === 0 ? t('review') : t('open')}
            </Text>
          </View>
        </Pressable>
      )}

      <DailyGoalsCard
        colors={colors}
        todaySummary={todaySummary}
        currentStreak={progression?.currentStreak ?? 0}
      />

      <ClanRankCard
        colors={colors}
        viewer={clanViewer}
        onPress={() =>
          clanViewer?.clanName
            ? navigation.navigate('Main', { screen: 'Compete' })
            : navigation.navigate('ClanSelection')
        }
      />

      {journey && <StagePathRail stages={journey.stages} colors={colors} />}

      <Pressable
        style={styles.questButton}
        onPress={() => navigation.navigate('Main', { screen: 'Quest' })}
        accessibilityRole="button"
        accessibilityLabel={t('newQuest')}
      >
        <Text style={styles.questButtonText}>{t('newQuest')}</Text>
      </Pressable>

      <View style={styles.practiceSection}>
        <View style={styles.practiceHeader}>
          <Text style={styles.practiceTitle}>{t('freePractice')}</Text>
          <Pressable
            onPress={() => navigation.navigate('WordMastery')}
            accessibilityRole="button"
            accessibilityLabel={t('viewAllHint')}
          >
            <Text style={styles.practiceLink}>{t('viewAll')}</Text>
          </Pressable>
        </View>
        <Text style={styles.practiceSubtitle}>{t('practiceSubtitle')}</Text>

        {wordMastery === null ? null : wordMastery.length === 0 ? (
          <Text style={styles.practiceEmpty}>{t('practiceEmpty')}</Text>
        ) : (
          <View style={styles.practiceList}>
            {wordMastery.slice(0, 3).map((item) => (
              <WordMasteryCard
                key={item.wordId}
                item={item}
                colors={colors}
                onPress={() => navigation.navigate('WordPractice', { wordId: item.wordId })}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.linkRow}>
        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.navigate('MasterChallenge')}
          accessibilityRole="button"
          accessibilityLabel={t('masterChallenge')}
        >
          <Text style={styles.linkButtonText}>{t('masterChallenge')}</Text>
        </Pressable>
        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.navigate('BossBattle')}
          accessibilityRole="button"
          accessibilityLabel={t('bossBattle')}
        >
          <Text style={styles.linkButtonText}>{t('bossBattle')}</Text>
          {battleCountdown && (
            <View style={styles.linkBadge}>
              <Text style={styles.linkBadgeText}>{battleCountdown.compact}</Text>
            </View>
          )}
          {battleCountdown && (
            <Text style={styles.linkButtonSubtext}>{battleCountdown.subtitle}</Text>
          )}
        </Pressable>
        <Pressable
          style={styles.linkButton}
          onPress={() => navigation.navigate('Ali')}
          accessibilityRole="button"
          accessibilityLabel={t('ali')}
        >
          <Text style={styles.linkButtonText}>{t('ali')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xxl,
      paddingTop: topInset + spacing.md,
      gap: spacing.md,
    },
    identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatarText: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
    greeting: {
      flex: 1,
      color: colors.arcaneSoft,
      fontSize: typography.scale.md,
      fontWeight: typography.display.weight,
    },
    pillRow: { flexDirection: 'row', gap: spacing.xs },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    pillGlow: {
      shadowColor: colors.warning,
      shadowOpacity: 0.6,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 0 },
    },
    pillText: { fontSize: typography.scale.sm, fontWeight: '700' },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    chapterCard: {
      borderRadius: radius.lg,
      borderWidth: 2,
      padding: spacing.md,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      overflow: 'hidden',
    },
    dateBadge: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    dateBadgeText: { color: colors.inkMuted, fontSize: typography.scale.xs, fontWeight: '700' },
    chapterBody: { flex: 1, gap: 1 },
    chapterEyebrow: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    chapterName: { fontSize: typography.scale.md, fontWeight: typography.display.weight },
    chapterSubtitle: { color: colors.inkMuted, fontSize: typography.scale.xs },
    chapterButton: {
      backgroundColor: colors.success,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    chapterButtonText: { color: '#0B2914', fontSize: typography.scale.xs, fontWeight: '700' },
    questButton: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    questButtonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    practiceSection: { gap: spacing.xs },
    practiceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    practiceTitle: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    practiceLink: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
    practiceSubtitle: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      marginBottom: spacing.xs,
    },
    practiceEmpty: { color: colors.inkMuted, fontSize: typography.scale.sm },
    practiceList: { gap: spacing.sm },
    linkRow: { flexDirection: 'row', gap: spacing.sm },
    linkButton: {
      flex: 1,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      gap: 2,
    },
    linkButtonText: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
    linkButtonSubtext: { color: colors.inkMuted, fontSize: 10 },
    linkBadge: {
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1,
    },
    linkBadgeText: { color: colors.inkMuted, fontSize: 10, fontWeight: '700' },
  });
}
