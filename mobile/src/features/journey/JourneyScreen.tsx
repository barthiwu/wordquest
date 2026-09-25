import { useCallback, useRef, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/state/themeStore';
import { getMyJourney, type JourneyView } from '@/services/journey';
import { useAuthStore } from '@/state/authStore';
import { journeyVisualFor, LEGEND_STAGE_KEY } from '@/constants/journeyVisuals';
import { countryCodeToFlagEmoji } from '@/utils/countryFlag';
import { JourneyStarBar } from '@/components/JourneyStarBar';
import { JourneyCelebration } from '@/components/JourneyCelebration';
import { JourneyMotif } from '@/components/JourneyMotif';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '@/app/navigation/MainTabNavigator';
import type { RootStackParamList } from '@/app/navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Journey'>,
  NativeStackScreenProps<RootStackParamList>
>;

/**
 * Screens 20/21 of the UI/UX Screen Bible (Journey map, Journey stage),
 * now the Journey tab, and the V1 Completion spec's Sprint 3 "world
 * systems" pass: a Star Bar across all 9 stages, per-stage titles and
 * colours, a Castle-stage country flag, a Kingdom-stage link into The
 * Order, and a Legend-stage celestial treatment — all driven by the
 * same server-computed lock state this screen already trusted (§42:
 * "the user should always know what remains"), nothing re-derived
 * client-side.
 *
 * The screen refetches on every focus (not just mount) — the same
 * pattern Home/Quest use — specifically so the stage-up celebration has
 * a real chance to fire: a player who levels up on Quest/Boss Battle and
 * taps back into this tab sees the celebration right then. It only
 * fires for an advance witnessed *within this app session* —
 * `previousStageRef` starts null on mount and is never persisted, so
 * reopening the app after progressing offline never shows a fake
 * "just now" celebration for something that happened hours ago.
 */
export function JourneyScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const { t } = useTranslation('journey');
  const accessToken = useAuthStore((s) => s.accessToken);
  const countryCode = useAuthStore((s) => s.user?.countryCode);
  const [journey, setJourney] = useState<JourneyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const previousStageRef = useRef<number | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    getMyJourney(accessToken)
      .then((view) => {
        const previous = previousStageRef.current;
        if (previous !== null && view.currentStage.stage > previous) {
          setCelebrating(true);
        }
        previousStageRef.current = view.currentStage.stage;
        setJourney(view);
      })
      .catch(() => setError(t('loadError')));
  }, [accessToken, t]);

  useFocusEffect(load);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!journey) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.arcaneSoft} />
      </View>
    );
  }

  const currentVisual = journeyVisualFor(journey.currentStage.key);
  const isLegend = journey.currentStage.key === LEGEND_STAGE_KEY;
  const castleStage = journey.stages.find((s) => s.key === 'castle')?.stage ?? Infinity;
  const kingdomStage = journey.stages.find((s) => s.key === 'kingdom')?.stage ?? Infinity;
  const showFlag = journey.currentStage.stage >= castleStage && countryCode;
  const showOrderLink = journey.currentStage.stage >= kingdomStage;
  const flagEmoji = showFlag ? countryCodeToFlagEmoji(countryCode) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {celebrating && (
        <JourneyCelebration
          stageName={journey.currentStage.name}
          primaryTitle={journey.currentStage.primaryTitle}
          stageKey={journey.currentStage.key}
          onDismiss={() => setCelebrating(false)}
        />
      )}

      <Text style={styles.title}>{t('title')}</Text>

      {/* Shadow lives on this outer wrapper — the inner LinearGradient
          clips to its rounded corners (overflow: hidden, for the motif
          scatter) which would otherwise clip the Legend glow too. */}
      <View style={isLegend && styles.currentCardShadowWrap}>
        <LinearGradient
          colors={currentVisual.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.currentCard, { borderColor: currentVisual.color }]}
        >
          <JourneyMotif icons={currentVisual.motif} color={currentVisual.color} />

          {isLegend && (
            <View style={styles.celestialRow}>
              <Ionicons name="sparkles" size={14} color={currentVisual.color} />
              <Ionicons name="sparkles" size={10} color={currentVisual.color} />
              <Ionicons name="sparkles" size={14} color={currentVisual.color} />
            </View>
          )}
          <View style={styles.currentHeader}>
            <View style={[styles.badge, { borderColor: currentVisual.color }]}>
              <Ionicons name={currentVisual.icon} size={26} color={currentVisual.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.currentStageName, { color: currentVisual.color }]}>
                {journey.currentStage.name}
                {flagEmoji ? `  ${flagEmoji}` : ''}
              </Text>
              <Text style={styles.currentTitle}>{journey.currentStage.primaryTitle}</Text>
            </View>
          </View>
          <Text style={styles.majorUnlock}>{journey.currentStage.majorUnlock}</Text>
        </LinearGradient>
      </View>

      <JourneyStarBar
        stages={journey.stages.map((s) => ({
          key: s.key,
          unlocked: s.unlocked,
          current: s.current,
        }))}
      />

      {journey.nextStage && (
        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>{t('nextLabel', { name: journey.nextStage.name })}</Text>
          <Text style={styles.nextRequirement}>
            {t('nextRequirement', {
              level: journey.nextStage.minLevel,
              count: journey.nextStage.requiredMasteredWords,
            })}
          </Text>
        </View>
      )}

      {showOrderLink && (
        // Kingdom Order banner (V20 Beta Release Checklist §9 visual
        // requirement) — the Kingdom stage's own gradient/color as a
        // ribbon-style banner, matching the visual weight the Castle flag
        // and Legend celestial effects already got, instead of a plain
        // bordered button that looked identical to the generic Skill
        // Radar/Word-in-the-Wild buttons below it.
        <View style={styles.orderBannerShadowWrap}>
          <Pressable
            onPress={() => navigation.navigate('Order')}
            accessibilityRole="button"
            accessibilityLabel={t('theOrder')}
            accessibilityHint={t('theOrderHint')}
          >
            <LinearGradient
              colors={journeyVisualFor('kingdom').gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.orderBanner, { borderColor: journeyVisualFor('kingdom').color }]}
            >
              <Ionicons name="ribbon" size={22} color={journeyVisualFor('kingdom').color} />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.orderBannerTitle, { color: journeyVisualFor('kingdom').color }]}
                >
                  {t('theOrder')}
                </Text>
                <Text style={styles.orderBannerSubtitle}>{t('orderBannerSubtitle')}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={journeyVisualFor('kingdom').color}
              />
            </LinearGradient>
          </Pressable>
        </View>
      )}

      <View style={styles.stageList}>
        {journey.stages.map((stage) => {
          const visual = journeyVisualFor(stage.key);
          return (
            <View
              key={stage.key}
              style={[
                styles.stageRow,
                stage.current && { borderColor: visual.color },
                !stage.unlocked && styles.stageRowLocked,
              ]}
            >
              <View style={[styles.stageBadge, { borderColor: visual.color }]}>
                <Ionicons
                  name={visual.icon}
                  size={16}
                  color={stage.unlocked ? visual.color : colors.inkMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stageName, !stage.unlocked && styles.stageNameLocked]}>
                  {stage.name} · {stage.primaryTitle}
                </Text>
                <Text style={styles.stageRequirement}>
                  {stage.unlocked
                    ? stage.majorUnlock
                    : t('stageLockedRequirement', {
                        level: stage.minLevel,
                        count: stage.requiredMasteredWords,
                      })}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <Pressable
        style={styles.skillRadarButton}
        onPress={() => navigation.navigate('SkillRadar')}
        accessibilityRole="button"
        accessibilityLabel={t('viewSkillRadar')}
      >
        <Text style={styles.skillRadarButtonText}>{t('viewSkillRadar')}</Text>
      </Pressable>

      <Pressable
        style={styles.witwButton}
        onPress={() => navigation.navigate('WordInTheWild')}
        accessibilityRole="button"
        accessibilityLabel={t('findWordInWild')}
      >
        <Text style={styles.witwButtonText}>{t('findWordInWild')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, gap: spacing.lg, paddingTop: topInset + spacing.xxl },
    centered: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    error: { color: colors.danger, fontSize: typography.scale.md },
    title: {
      color: colors.ink,
      fontSize: typography.scale.xl,
      fontWeight: typography.display.weight,
    },
    currentCard: {
      borderRadius: radius.lg,
      borderWidth: 2,
      padding: spacing.lg,
      gap: spacing.sm,
      overflow: 'hidden',
    },
    currentCardShadowWrap: {
      shadowColor: '#E9D5FF',
      shadowOpacity: 0.5,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
    },
    celestialRow: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'flex-end' },
    currentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    badge: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    currentStageName: {
      fontSize: typography.scale.lg,
      fontWeight: typography.display.weight,
    },
    currentTitle: { color: colors.inkMuted, fontSize: typography.scale.sm },
    majorUnlock: { color: colors.inkMuted, fontSize: typography.scale.xs },
    nextCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.arcane,
      padding: spacing.md,
      gap: 2,
    },
    nextLabel: { color: colors.arcaneSoft, fontSize: typography.scale.md, fontWeight: '700' },
    nextRequirement: { color: colors.inkMuted, fontSize: typography.scale.sm },
    orderBannerShadowWrap: {
      shadowColor: '#818CF8',
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
    },
    orderBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 2,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    orderBannerTitle: { fontSize: typography.scale.md, fontWeight: typography.display.weight },
    orderBannerSubtitle: { color: colors.inkMuted, fontSize: typography.scale.xs, marginTop: 2 },
    stageList: { gap: spacing.sm },
    stageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    stageRowLocked: { opacity: 0.5 },
    stageBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stageName: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
    stageNameLocked: { color: colors.inkMuted },
    stageRequirement: { color: colors.inkMuted, fontSize: typography.scale.xs },
    skillRadarButton: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    skillRadarButtonText: {
      color: colors.arcaneSoft,
      fontSize: typography.scale.md,
      fontWeight: '700',
    },
    witwButton: {
      backgroundColor: colors.arcane,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    witwButtonText: { color: colors.ink, fontSize: typography.scale.md, fontWeight: '700' },
  });
}
