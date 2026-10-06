import { useArcadeLauncher } from '@/features/arcade/useArcadeLauncher';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { timeOfDayGreeting } from '@/utils/timeOfDay';
import { VerificationBanner } from '@/components/VerificationBanner';
import { StreakMilestoneRibbon } from '@/components/StreakMilestoneRibbon';
import { WordMasteryCard } from '@/components/WordMasteryCard';
import type { TodayQuestWindowSummary } from '@/services/quests';
import type { MainTabParamList } from '@/app/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';
import { useHomeData } from '@/features/home/useHomeData';
import { AliScene } from './ui/AliScene';
import { SceneBackdrop } from './ui/SceneBackdrop';
import { ArcadeArt } from './ui/ProtoArt';
import { GlassCard, Panel, ProgressBar, ProtoButton, SectionHeader } from './ui/ProtoUI';
import { ProtoMobileHeader } from './ui/ProtoNav';
import { useProtoExtras } from './ui/useProtoExtras';
import { sceneForStage } from './sceneForStage';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

function questIcon(q: TodayQuestWindowSummary): keyof typeof Ionicons.glyphMap {
  const h = q.windowStartHour ?? 0;
  if (h < 11) return 'sunny';
  if (h < 17) return 'partly-sunny';
  return 'moon';
}

function windowLabel(q: TodayQuestWindowSummary, fallback: string): string {
  const h = q.windowStartHour ?? 0;
  if (h < 11) return 'Morning';
  if (h < 17) return 'Afternoon';
  return q.title ? 'Evening' : fallback;
}

/**
 * Prototype Home (Oct 2026 UI prototype, sheet 1): ALI on a rock in a
 * painted-style scene greeting the player, the current Daily Quest as a
 * glass card with a gradient "Start Quest", Daily Goals with the three
 * windows, streak + XP tiles, the three-game Arcade, Compete + Your
 * Journey. Live server state only (useHomeData), same destinations as
 * the standard Home.
 */
export function ProtoHomeScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const x = useProtoExtras();
  const bp = useBreakpoint();
  const { t } = useTranslation(['home', 'arcade', 'proto']);
  const displayName = useAuthStore((s) => s.user?.displayName);
  const data = useHomeData();
  const { launch, sheet } = useArcadeLauncher();
  const { progression, journey, todaySummary, wordMastery } = data;
  const wide = !bp.isMobile;

  const quests = todaySummary?.quests ?? [];
  const hour = new Date().getHours();
  const current = useMemo(() => {
    const open = quests.filter((q) => !q.completed);
    const inWindow = open.find(
      (q) => (q.windowStartHour ?? 0) <= hour && (q.windowEndHour === null || hour <= (q.windowEndHour ?? 24)),
    );
    const unlocked = open.filter((q) => (q.windowStartHour ?? 0) <= hour);
    return inWindow ?? unlocked[0] ?? open[0] ?? null;
  }, [quests, hour]);

  const wordsRemaining = todaySummary ? Math.max(0, todaySummary.totalCount - todaySummary.completedCount) : null;
  const greeting = `${timeOfDayGreeting()}${displayName ? `, ${displayName}` : ''}!`;
  const aliLine =
    wordsRemaining === null
      ? t('proto:readyForQuest')
      : wordsRemaining > 0
        ? t('home:wordsRemaining', { count: wordsRemaining })
        : t('home:allCaughtUp');

  const startQuest = () =>
    current ? navigation.navigate('DailyQuest', { questKey: current.key }) : navigation.navigate('Main', { screen: 'Play' });

  const nextStage = journey?.nextStage ?? null;
  const mastered = progression?.masteredWordsCount ?? 0;
  const target = nextStage?.requiredMasteredWords ?? journey?.currentStage.requiredMasteredWords ?? 0;
  const pct = target > 0 ? Math.min(1, mastered / target) : 0;

  const questCard = (
    <GlassCard style={[styles.questCard, wide && styles.questCardWide]}>
      <Text style={[styles.eyebrow, { color: colors.arcaneSoft }]}>✦  {t('proto:todaysQuest')}  ✦</Text>
      {current ? (
        <>
          <View style={styles.questTitleRow}>
            <Ionicons name={questIcon(current)} size={30} color={x.flame} />
            <Text style={[styles.questTitle, { color: colors.ink }]} numberOfLines={1}>
              {current.title.toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.questSub, { color: colors.inkMuted }]}>{t('proto:discoverWord')}</Text>
          <ProtoButton label={t('proto:startQuest')} trailingIcon="arrow-forward" onPress={startQuest} />
        </>
      ) : todaySummary ? (
        <>
          <Text style={[styles.questTitle, { color: colors.ink, textAlign: 'center' }]}>{t('home:allCaughtUp')}</Text>
          <ProtoButton label={t('home:review')} onPress={startQuest} variant="outline" />
        </>
      ) : (
        <ActivityIndicator color={colors.arcaneSoft} />
      )}
    </GlassCard>
  );

  const goals = (
    <Panel style={styles.flex1}>
      <SectionHeader
        title={t('proto:dailyGoals')}
        caption={todaySummary ? t('proto:completeOf', { done: todaySummary.completedCount, total: todaySummary.totalCount }) : undefined}
      />
      <View style={styles.goalRow}>
        {quests.map((q) => (
          <View key={q.key} style={styles.goalCell}>
            <View
              style={[
                styles.goalRing,
                { borderColor: q.completed ? colors.success : q.inProgress ? colors.arcane : colors.border, backgroundColor: q.completed ? `${colors.success}22` : colors.surfaceRaised },
              ]}
            >
              <Ionicons name={questIcon(q)} size={24} color={q.completed ? colors.success : colors.warning} />
            </View>
            <Text style={[styles.goalLabel, { color: colors.ink }]}>
              {windowLabel(q, q.title)} {q.completed ? <Text style={{ color: colors.success }}>✓</Text> : null}
            </Text>
          </View>
        ))}
        {!todaySummary ? <ActivityIndicator color={colors.arcaneSoft} /> : null}
      </View>
    </Panel>
  );

  const stats = (
    <Panel style={[styles.statsPanel, wide && styles.statsWide]}>
      <View style={styles.statCell}>
        <Ionicons name="flame" size={34} color={progression?.playedToday ? x.flame : colors.inkMuted} />
        <View>
          <Text style={[styles.statValue, { color: colors.ink }]}>{progression?.currentStreak ?? 0}</Text>
          <Text style={[styles.statLabel, { color: colors.inkMuted }]}>{t('proto:dayStreak')}</Text>
        </View>
      </View>
      <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
      <View style={styles.statCell}>
        <Ionicons name="star" size={32} color={colors.glyph} />
        <View>
          <Text style={[styles.statValue, { color: colors.ink }]}>{(progression?.totalXp ?? 0).toLocaleString()}</Text>
          <Text style={[styles.statLabel, { color: colors.inkMuted }]}>{t('proto:totalXp')}</Text>
        </View>
      </View>
    </Panel>
  );

  const arcade = (
    <Panel>
      <SectionHeader title={t('home:arcade')} caption={t('proto:playAndEarn')} />
      <View style={[styles.tileRow, wide && { gap: 14 }]}>
        {(
          [
            { route: 'ScrambleQuest', kind: 'scramble', title: t('arcade:scrambleQuestTitle'), sub: t('arcade:scrambleQuestSubtitle') },
            { route: 'WordDuel', kind: 'duel', title: t('arcade:wordDuelTitle'), sub: t('arcade:wordDuelSubtitle') },
            { route: 'CompleteIt', kind: 'complete', title: t('arcade:completeItTitle'), sub: t('arcade:completeItSubtitle') },
            { route: 'Hangman', kind: 'hangman', title: t('arcade:hangmanTitle'), sub: t('arcade:hangmanSubtitle') },
          ] as const
        ).map((g) => (
          <Pressable
            key={g.route}
            style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
            onPress={() => launch(g.route)}
            accessibilityRole="button"
            accessibilityLabel={g.title}
          >
            <ArcadeArt kind={g.kind} width={wide ? 220 : 110} height={wide ? 120 : 84} style={styles.tileArt} />
            <Text style={[styles.tileTitle, { color: colors.ink }]} numberOfLines={1}>
              {g.title}
            </Text>
            {wide ? (
              <Text style={[styles.tileSub, { color: colors.inkMuted }]} numberOfLines={2}>
                {g.sub}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </Panel>
  );

  const goCompete = () => navigation.navigate('Main', { screen: 'Play' });
  const compete = (
    <Panel style={styles.flex1}>
      <SectionHeader title={t('proto:compete')} />
      <View style={styles.tileRow}>
        <Pressable style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} onPress={() => navigation.navigate('WordDuel')} accessibilityRole="button" accessibilityLabel={t('arcade:wordDuelTitle')}>
          <ArcadeArt kind="duel" width={wide ? 150 : 110} height={70} style={styles.tileArt} />
          <Text style={[styles.tileTitle, { color: colors.ink }]}>{t('arcade:wordDuelTitle')}</Text>
          <Text style={[styles.tileSub, { color: colors.inkMuted }]}>{t('proto:findRival')}</Text>
        </Pressable>
        <Pressable style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} onPress={() => navigation.navigate('BossBattle')} accessibilityRole="button" accessibilityLabel={t('home:bossBattle')}>
          <ArcadeArt kind="boss" width={wide ? 150 : 110} height={70} style={styles.tileArt} />
          <Text style={[styles.tileTitle, { color: colors.ink }]}>{t('home:bossBattle')}</Text>
          <Text style={[styles.tileSub, { color: colors.inkMuted }]}>{t('proto:weeklyChallenge')}</Text>
        </Pressable>
      </View>
    </Panel>
  );

  const journeyCard = (
    <Panel style={styles.flex1}>
      <SectionHeader
        title={t('home:yourJourney')}
        caption={nextStage ? t('proto:nextWorld', { name: nextStage.name.replace(/^The /, '') }) : undefined}
      />
      {journey ? (
        <Pressable
          style={[styles.journeyRow, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
          onPress={() => navigation.navigate('Main', { screen: 'Journey' })}
          accessibilityRole="button"
          accessibilityLabel={`${t('home:yourJourney')}: ${journey.currentStage.name}`}
        >
          <SceneBackdrop variant={sceneForStage(journey.currentStage.key)} height={78} animated={false} style={styles.journeyThumb} />
          <View style={styles.flex1}>
            <Text style={[styles.tileTitle, { color: colors.ink, fontSize: 17 }]} numberOfLines={1}>
              {journey.currentStage.name.replace(/^The /, '')}
            </Text>
            <Text style={[styles.tileSub, { color: colors.inkMuted }]} numberOfLines={1}>
              {journey.currentStage.primaryTitle}
            </Text>
            <ProgressBar value={pct} style={{ marginTop: 8 }} />
            <View style={styles.journeyMeta}>
              <Text style={[styles.tileSub, { color: colors.inkMuted }]}>{t('proto:masteredOf', { done: mastered, total: target })}</Text>
              <Text style={[styles.tileSub, { color: colors.inkMuted }]}>{t('proto:toGo', { count: Math.max(0, target - mastered) })}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.arcaneSoft} />
        </Pressable>
      ) : (
        <ActivityIndicator color={colors.arcaneSoft} />
      )}
    </Panel>
  );

  const practice =
    wordMastery && wordMastery.length > 0 ? (
      <Panel>
        <SectionHeader
          title={t('home:freePractice')}
          right={
            <Pressable onPress={() => navigation.navigate('WordMastery')} accessibilityRole="button" accessibilityLabel={t('home:viewAllHint')} hitSlop={8}>
              <Text style={{ color: colors.arcaneSoft, fontWeight: '800' }}>{t('home:viewAll')}</Text>
            </Pressable>
          }
        />
        <View style={[styles.practiceGrid, wide && { flexDirection: 'row', flexWrap: 'wrap' }]}>
          {wordMastery.slice(0, bp.isDesktop ? 3 : bp.isTablet ? 2 : 2).map((item) => (
            <View key={item.wordId} style={wide ? styles.practiceCell : undefined}>
              <WordMasteryCard item={item} colors={colors} onPress={() => navigation.navigate('WordPractice', { wordId: item.wordId })} />
            </View>
          ))}
        </View>
      </Panel>
    ) : null;

  const heroHeight = wide ? 340 : 300;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {sheet}
      <AliScene
        variant="forest"
        height={heroHeight}
        message={
          <Pressable
            onPress={() => navigation.navigate('Ali')}
            accessibilityRole="button"
            accessibilityLabel={t('home:openAli')}
          >
            <Text style={styles.bubbleTitle}>{greeting}</Text>
            <Text style={styles.bubbleSub}>{aliLine}</Text>
          </Pressable>
        }
        expression={wordsRemaining === 0 ? 'PROUD' : 'PLEASED'}
        pose="PERCHED"
        aliSize={wide ? 270 : 150}
        bubbleTop={wide ? undefined : 58}
        fadeTo={wide ? undefined : colors.background}
      >
        <View style={styles.headerOverlay} pointerEvents="box-none">
          <ProtoMobileHeader />
        </View>
        {wide ? <View style={styles.questOverlay}>{questCard}</View> : null}
      </AliScene>

      <View style={[styles.body, wide && styles.bodyWide]}>
        {!wide ? <View style={{ marginTop: -28 }}>{questCard}</View> : null}
        {progression ? <StreakMilestoneRibbon currentStreak={progression.currentStreak} /> : null}
        <VerificationBanner onPress={() => navigation.navigate('Settings')} />
        {data.masterChallenge?.status === 'AVAILABLE' ? (
          <Pressable
            onPress={() => navigation.navigate('MasterChallenge')}
            accessibilityRole="button"
            accessibilityLabel={t('home:masterChallengeCta')}
          >
            <Panel style={[styles.masterCard, { borderColor: colors.glyph }]}>
              <Ionicons name="trophy" size={24} color={colors.glyph} />
              <View style={styles.flex1}>
                <Text style={[styles.masterTitle, { color: colors.ink }]}>{t('home:masterChallengeTitle')}</Text>
                <Text style={{ color: colors.inkMuted, fontSize: 13 }}>{t('home:masterChallengeSub')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.glyph} />
            </Panel>
          </Pressable>
        ) : null}
        {data.failed ? <Text style={{ color: colors.danger }}>{t('home:errorGeneric')}</Text> : null}
        {!progression && !data.failed ? <ActivityIndicator color={colors.arcaneSoft} /> : null}

        <View style={[styles.row, wide && styles.rowWide]}>
          <View style={wide ? styles.flex2 : undefined}>{goals}</View>
          <View style={wide ? styles.flex1 : undefined}>{stats}</View>
        </View>
        {arcade}
        <View style={[styles.row, wide && styles.rowWide]}>
          {compete}
          {journeyCard}
        </View>
        {practice}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  questOverlay: { position: 'absolute', right: 32, top: 40, width: 380 },
  questCard: { gap: 10, padding: 16 },
  questCardWide: { padding: 20 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
  questTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  questTitle: { fontSize: 22, fontWeight: '900', letterSpacing: 0.8 },
  questSub: { fontSize: 13, textAlign: 'center', marginBottom: 2 },
  body: { paddingHorizontal: 14, gap: 14 },
  bodyWide: { paddingHorizontal: 32, paddingTop: 22, maxWidth: 1240, width: '100%', alignSelf: 'center' },
  row: { gap: 14 },
  rowWide: { flexDirection: 'row' },
  flex1: { flex: 1 },
  masterCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5 },
  masterTitle: { fontSize: 16, fontWeight: '800' },
  flex2: { flex: 2 },
  goalRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  goalCell: { alignItems: 'center', gap: 6, flex: 1 },
  goalRing: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  goalLabel: { fontSize: 12, fontWeight: '700' },
  statsPanel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  statsWide: { height: '100%' },
  statCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statDivider: { width: 1, height: 40 },
  statValue: { fontSize: 24, fontWeight: '900' },
  statLabel: { fontSize: 12, fontWeight: '600' },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  tile: { flexGrow: 1, flexBasis: '22%', minWidth: 130, borderWidth: 1, borderRadius: 16, padding: 8, alignItems: 'center', gap: 6 },
  tileArt: { borderRadius: 12, alignSelf: 'stretch', width: '100%' },
  tileTitle: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  tileSub: { fontSize: 12, textAlign: 'center' },
  journeyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 10, marginTop: 12 },
  journeyThumb: { width: 96, borderRadius: 12 },
  journeyMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  practiceGrid: { gap: 10, marginTop: 12 },
  practiceCell: { width: '32%', minWidth: 260, flexGrow: 1 },
  bubbleTitle: { color: '#0E1A33', fontSize: 15, fontWeight: '800' },
  bubbleSub: { color: '#2A3B5E', fontSize: 13, marginTop: 2 },
});
