import { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { timeOfDayGreeting } from '@/utils/timeOfDay';
import { journeyVisualFor } from '@/constants/journeyVisuals';
import { ResponsiveContainer } from '@/components/layout/ResponsiveContainer';
import { VerificationBanner } from '@/components/VerificationBanner';
import { GlyphCoin } from '@/components/GlyphIcon';
import { StreakMilestoneRibbon } from '@/components/StreakMilestoneRibbon';
import { DailyGoalsCard } from '@/components/DailyGoalsCard';
import { ClanRankCard } from '@/components/ClanRankCard';
import { BossBattleRankCard } from '@/components/BossBattleRankCard';
import { FriendRankCard } from '@/components/FriendRankCard';
import { StagePathRail } from '@/components/StagePathRail';
import { WordMasteryCard } from '@/components/WordMasteryCard';
import { JourneyMotif } from '@/components/JourneyMotif';
import { AliMark } from '@/components/AliMark';
import {
  CompleteItIcon,
  ScrambleQuestIcon,
  WordDuelIcon,
} from '@/components/ArcadeGameIcons';
import type { MainTabParamList } from '@/app/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';
import { useHomeData } from './useHomeData';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** Only the three V1 arcade games — the prototype's extra "Odd Word Out" /
 * "Definition Dash" tiles are deliberately omitted (UI spec §10). */
const ARCADE_GAMES = [
  { route: 'ScrambleQuest', titleKey: 'arcade:scrambleQuestTitle', subKey: 'arcade:scrambleQuestSubtitle', Icon: ScrambleQuestIcon },
  { route: 'WordDuel', titleKey: 'arcade:wordDuelTitle', subKey: 'arcade:wordDuelSubtitle', Icon: WordDuelIcon },
  { route: 'CompleteIt', titleKey: 'arcade:completeItTitle', subKey: 'arcade:completeItSubtitle', Icon: CompleteItIcon },
] as const;

/**
 * Redesigned Home (UI spec §8) — shown when the "New look" flag is on.
 * Priority order: identity header → ALI greeting → Today's Quest hero →
 * Daily Goals + streak → Arcade (3 games) → compact ranks → Your Journey →
 * Free Practice. Mobile is one column in that order; tablet puts Daily
 * Goals beside the hero and pairs the lower sections; desktop widens the
 * hero and runs the secondary sections in multi-column rows. UI-only: all
 * numbers come from useHomeData (live server state), every destination is
 * an existing route.
 */
export function NewHomeScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const bp = useBreakpoint();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation(['home', 'arcade', 'catchUp']);
  const displayName = useAuthStore((s) => s.user?.displayName);
  const avatarUrl = useAuthStore((s) => s.user?.avatarUrl);
  const data = useHomeData();
  const { progression, journey, todaySummary, wordMastery } = data;

  const wide = !bp.isMobile;
  const wordsRemaining = todaySummary
    ? Math.max(0, todaySummary.totalCount - todaySummary.completedCount)
    : null;
  const visual = journey ? journeyVisualFor(journey.currentStage.key) : null;
  const initial = (displayName?.trim()?.[0] ?? '?').toUpperCase();
  const streakSafeToday = progression?.playedToday ?? false;
  const goPlay = () => navigation.navigate('Main', { screen: 'Play' });
  const goCompete = () => navigation.navigate('Main', { screen: 'Compete' });

  const aliLine =
    wordsRemaining === null
      ? ' '
      : wordsRemaining > 0
        ? t('wordsRemaining', { count: wordsRemaining })
        : t('allCaughtUp');

  const hero = journey ? (
    <Pressable
      style={[styles.hero, { borderColor: visual?.color ?? colors.border }, wide && styles.heroWide]}
      onPress={goPlay}
      accessibilityRole="button"
      accessibilityLabel={`${t('todaysChapter')}: ${journey.currentStage.name}`}
    >
      {visual && <JourneyMotif icons={visual.motif} color={visual.color} />}
      <Text style={styles.eyebrow}>{t('todaysChapter')}</Text>
      <Text style={[styles.heroTitle, { color: visual?.color ?? colors.ink }]} numberOfLines={2}>
        {journey.currentStage.name}
      </Text>
      <Text style={styles.heroSub}>{aliLine}</Text>
      <View style={styles.cta}>
        <Ionicons name="play" size={16} color={colors.background} />
        <Text style={styles.ctaText}>{wordsRemaining === 0 ? t('review') : t('open')}</Text>
      </View>
    </Pressable>
  ) : (
    <View style={[styles.hero, styles.heroPlaceholder]}>
      <ActivityIndicator color={colors.arcaneSoft} />
    </View>
  );

  const goals = (
    <DailyGoalsCard
      colors={colors}
      todaySummary={todaySummary}
      currentStreak={progression?.currentStreak ?? 0}
      playedToday={progression?.playedToday ?? false}
    />
  );

  const arcade = (
    <View style={styles.block}>
      <Text style={styles.sectionTitle}>{t('arcade')}</Text>
      <View style={[styles.grid, wide && styles.gridRow]}>
        {ARCADE_GAMES.map(({ route, titleKey, subKey, Icon }) => (
          <Pressable
            key={route}
            style={[styles.card, styles.arcadeCard, wide && styles.cell]}
            onPress={() => navigation.navigate(route)}
            accessibilityRole="button"
            accessibilityLabel={t(titleKey)}
          >
            <Icon colors={colors} />
            <View style={styles.arcadeText}>
              <Text style={styles.cardTitle}>{t(titleKey)}</Text>
              <Text style={styles.cardSub} numberOfLines={2}>
                {t(subKey)}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const ranks = (
    <View style={[styles.grid, wide && styles.gridRow]}>
      <View style={wide ? styles.cell : undefined}>
        <ClanRankCard
          colors={colors}
          viewer={data.clanViewer}
          onPress={() =>
            data.clanViewer?.clanName ? goCompete() : navigation.navigate('ClanSelection')
          }
        />
      </View>
      <View style={wide ? styles.cell : undefined}>
        <BossBattleRankCard colors={colors} viewer={data.bossBattleRankViewer} onPress={goCompete} />
      </View>
      <View style={wide ? styles.cell : undefined}>
        <FriendRankCard
          colors={colors}
          viewer={data.friendRankViewer}
          friendCount={data.friendCount}
          onPress={goCompete}
        />
      </View>
    </View>
  );

  const journeyBlock = journey ? (
    <View style={styles.block}>
      <Text style={styles.sectionTitle}>{t('yourJourney')}</Text>
      <StagePathRail stages={journey.stages} colors={colors} />
    </View>
  ) : null;

  const practice = (
    <View style={styles.block}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('freePractice')}</Text>
        <Pressable
          onPress={() => navigation.navigate('WordMastery')}
          accessibilityRole="button"
          accessibilityLabel={t('viewAllHint')}
          hitSlop={8}
        >
          <Text style={styles.link}>{t('viewAll')}</Text>
        </Pressable>
      </View>
      {wordMastery === null ? null : wordMastery.length === 0 ? (
        <Text style={styles.cardSub}>{t('practiceEmpty')}</Text>
      ) : (
        <View style={[styles.grid, wide && styles.gridRow]}>
          {wordMastery.slice(0, bp.isDesktop ? 5 : bp.isTablet ? 2 : 3).map((item) => (
            <View key={item.wordId} style={wide ? styles.cell : undefined}>
              <WordMasteryCard
                item={item}
                colors={colors}
                onPress={() => navigation.navigate('WordPractice', { wordId: item.wordId })}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <ResponsiveContainer style={styles.page}>
        {/* 1. Identity + utilities */}
        <View style={styles.identityRow}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <Text style={styles.greeting} numberOfLines={2}>
            {timeOfDayGreeting()}
            {displayName ? `, ${displayName}` : ''}
          </Text>
          {progression && (
            <View style={styles.pillRow}>
              <Pressable
                style={styles.iconPill}
                onPress={() => navigation.navigate('CatchUpCalendar')}
                accessibilityRole="button"
                accessibilityLabel={t('catchUp:homeLinkLabel')}
                hitSlop={8}
              >
                <Ionicons name="calendar-outline" size={18} color={colors.inkMuted} />
              </Pressable>
              <View style={styles.pill}>
                <Ionicons
                  name="flame"
                  size={14}
                  color={streakSafeToday ? colors.warning : colors.inkMuted}
                />
                <Text
                  style={[styles.pillText, { color: streakSafeToday ? colors.warning : colors.inkMuted }]}
                >
                  {progression.currentStreak}
                </Text>
              </View>
              <View style={styles.pill}>
                <GlyphCoin size={16} />
                <Text style={[styles.pillText, { color: colors.glyph }]}>{progression.glyphBalance}</Text>
              </View>
            </View>
          )}
        </View>

        {progression && <StreakMilestoneRibbon currentStreak={progression.currentStreak} />}
        <VerificationBanner onPress={() => navigation.navigate('Settings')} />
        {!progression && !data.failed && <ActivityIndicator color={colors.arcaneSoft} />}
        {data.failed && <Text style={styles.error}>{t('errorGeneric')}</Text>}

        {/* 2. ALI contextual greeting (text only; ALI reactions stay in AliService) */}
        <View style={styles.aliRow} accessibilityRole="text">
          <View style={styles.aliBadge}>
            <AliMark size={18} />
          </View>
          <Text style={styles.aliText}>{aliLine}</Text>
        </View>

        {/* 3 + 4. Hero and Daily Goals — side by side from tablet up */}
        <View style={[styles.heroRow, wide && styles.heroRowWide]}>
          <View style={wide ? styles.heroCol : undefined}>{hero}</View>
          <View style={wide ? styles.goalsCol : undefined}>{goals}</View>
        </View>

        {/* 5. Arcade */}
        {arcade}

        {/* 6. Compact social/competitive */}
        {ranks}

        {/* 7. Your Journey (full width — the stage rail is a horizontal strip) */}
        {journeyBlock}

        {/* 8. Free Practice */}
        {practice}
      </ResponsiveContainer>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, paddingTop: topInset + spacing.md, paddingBottom: spacing.xxl },
    page: { paddingHorizontal: spacing.md, gap: spacing.lg },
    identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: colors.arcaneSoft, fontSize: typography.scale.md, fontWeight: '700' },
    greeting: { flex: 1, minWidth: 0, color: colors.ink, fontSize: typography.scale.lg, fontWeight: '700' },
    pillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    iconPill: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pill: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pillText: { fontSize: typography.scale.sm, fontWeight: '700' },
    error: { color: colors.danger, fontSize: typography.scale.sm },
    aliRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.sm,
      paddingRight: spacing.md,
    },
    aliBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.arcaneSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aliText: { flex: 1, color: colors.ink, fontSize: typography.scale.sm, fontWeight: '600' },
    heroRow: { gap: spacing.lg },
    heroRowWide: { flexDirection: 'row', alignItems: 'stretch' },
    heroCol: { flex: 3 },
    goalsCol: { flex: 2 },
    hero: {
      overflow: 'hidden',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      padding: spacing.lg,
      gap: spacing.sm,
      minHeight: 190,
      justifyContent: 'flex-end',
    },
    heroWide: { flex: 1, minHeight: 240, padding: spacing.xl },
    heroPlaceholder: { borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    eyebrow: {
      color: colors.inkMuted,
      fontSize: typography.scale.xs,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    heroTitle: { fontSize: typography.scale.xl, fontWeight: typography.display.weight },
    heroSub: { color: colors.inkMuted, fontSize: typography.scale.sm },
    cta: {
      alignSelf: 'flex-start',
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      backgroundColor: colors.arcaneSoft,
      marginTop: spacing.sm,
    },
    ctaText: { color: colors.background, fontSize: typography.scale.md, fontWeight: '800', letterSpacing: 0.5 },
    block: { gap: spacing.sm },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: {
      color: colors.ink,
      fontSize: typography.scale.sm,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    link: { color: colors.arcaneSoft, fontSize: typography.scale.sm, fontWeight: '700' },
    grid: { gap: spacing.sm },
    gridRow: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { flexGrow: 1, flexBasis: 220, minWidth: 0 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    arcadeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 72 },
    arcadeText: { flex: 1, gap: 2 },
    cardTitle: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    cardSub: { color: colors.inkMuted, fontSize: typography.scale.sm },
  });
}
