import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/state/themeStore';
import { useAuthStore } from '@/state/authStore';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getMyProgression } from '@/services/progression';
import type { JourneyView } from '@/services/journey';
import { journeyVisualFor } from '@/constants/journeyVisuals';
import { AliScene } from './ui/AliScene';
import { SceneBackdrop } from './ui/SceneBackdrop';
import { GlassCard, Panel, Pill, ProgressBar, ProtoButton, SectionHeader } from './ui/ProtoUI';
import { ProtoMobileHeader } from './ui/ProtoNav';
import { sceneForStage } from './sceneForStage';

export interface ProtoJourneyViewProps {
  journey: JourneyView;
  flagEmoji: string | null;
  showOrderLink: boolean;
  onOrder: () => void;
  onSkillRadar: () => void;
  /** Omitted while Word in the Wild is parked for V2. */
  onWordInWild?: () => void;
  celebration?: ReactNode;
}

/**
 * Prototype "New look" Journey: ALI in the current stage's world, progress
 * toward the next world, and a map of all nine worlds as scene cards.
 * Lock state, requirements and unlocks come straight from the server's
 * JourneyView — the same data the standard Journey tab renders.
 */
export function ProtoJourneyView(p: ProtoJourneyViewProps) {
  const { t } = useTranslation('journey');
  const { t: tp } = useTranslation('proto');
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const wide = !isMobile;
  const accessToken = useAuthStore((s) => s.accessToken);
  const [mastered, setMastered] = useState<number | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    getMyProgression(accessToken).then((pr) => setMastered(pr.masteredWordsCount)).catch(() => {});
  }, [accessToken]);

  const { currentStage, nextStage, stages } = p.journey;
  const pct = nextStage && mastered !== null ? Math.min(1, mastered / Math.max(1, nextStage.requiredMasteredWords)) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {p.celebration}
      <AliScene
        variant={sceneForStage(currentStage.key)}
        height={wide ? 320 : 280}
        aliSize={wide ? 230 : 150}
        bubbleTop={wide ? undefined : 58}
        expression="PLEASED"
        pose="PERCHED"
        message={
          <View>
            <Text style={styles.bubbleTitle}>{currentStage.name}{p.flagEmoji ? `  ${p.flagEmoji}` : ''}</Text>
            <Text style={styles.bubbleSub}>{currentStage.primaryTitle}</Text>
          </View>
        }
        fadeTo={wide ? undefined : colors.background}
      >
        <View style={styles.header} pointerEvents="box-none">
          <ProtoMobileHeader />
        </View>
      </AliScene>

      <View style={[styles.body, wide && styles.bodyWide]}>
        <GlassCard style={styles.current}>
          <Text style={[styles.eyebrow, { color: colors.arcaneSoft }]}>{t('title')}</Text>
          <Text style={[styles.stageName, { color: colors.ink }]}>{currentStage.name} · {currentStage.primaryTitle}</Text>
          <Text style={{ color: colors.inkMuted, fontSize: 14 }}>{currentStage.majorUnlock}</Text>
          {nextStage ? (
            <View style={{ gap: 6, marginTop: 6 }}>
              <View style={styles.nextRow}>
                <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 14 }}>{t('nextLabel', { name: nextStage.name })}</Text>
                {mastered !== null ? (
                  <Text style={{ color: colors.inkMuted, fontSize: 12, fontWeight: '700' }}>
                    {tp('masteredOf', { done: Math.min(mastered, nextStage.requiredMasteredWords), total: nextStage.requiredMasteredWords })}
                  </Text>
                ) : null}
              </View>
              <ProgressBar value={pct} />
              <Text style={{ color: colors.inkMuted, fontSize: 12 }}>
                {t('nextRequirement', { level: nextStage.minLevel, count: nextStage.requiredMasteredWords })}
              </Text>
            </View>
          ) : null}
        </GlassCard>

        {p.showOrderLink ? (
          <Pressable onPress={p.onOrder} accessibilityRole="button" accessibilityLabel={t('theOrder')} accessibilityHint={t('theOrderHint')}>
            <Panel style={styles.order}>
              <Ionicons name="ribbon" size={26} color={journeyVisualFor('kingdom').color} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 16 }}>{t('theOrder')}</Text>
                <Text style={{ color: colors.inkMuted, fontSize: 13 }}>{t('orderBannerSubtitle')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
            </Panel>
          </Pressable>
        ) : null}

        <SectionHeader title={tp('worlds')} caption={tp('worldsUnlocked', { done: stages.filter((s) => s.unlocked).length, total: stages.length })} />
        <View style={[styles.grid, wide && styles.gridWide]}>
          {stages.map((s) => {
            const visual = journeyVisualFor(s.key);
            return (
              <View
                key={s.key}
                style={[
                  styles.stageCard,
                  wide && styles.stageCardWide,
                  { backgroundColor: colors.surface, borderColor: s.current ? visual.color : colors.border, borderWidth: s.current ? 2 : 1 },
                ]}
              >
                <View style={{ opacity: s.unlocked ? 1 : 0.4 }}>
                  <SceneBackdrop variant={sceneForStage(s.key)} height={wide ? 96 : 84} animated={false} style={styles.thumb} />
                </View>
                {!s.unlocked ? (
                  <View style={styles.lock} pointerEvents="none">
                    <Ionicons name="lock-closed" size={22} color="#FFFFFF" />
                  </View>
                ) : null}
                <View style={styles.stageText}>
                  <View style={styles.stageTitleRow}>
                    <Text style={[styles.stageCardName, { color: s.unlocked ? colors.ink : colors.inkMuted }]} numberOfLines={1}>{s.name}</Text>
                    {s.current ? <Pill color={visual.color}>{tp('here')}</Pill> : s.unlocked ? <Ionicons name="checkmark-circle" size={18} color={colors.success} /> : null}
                  </View>
                  <Text style={{ color: colors.inkMuted, fontSize: 12 }} numberOfLines={2}>
                    {s.unlocked ? s.primaryTitle : t('stageLockedRequirement', { level: s.minLevel, count: s.requiredMasteredWords })}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.actions}>
          <ProtoButton variant="outline" icon="analytics-outline" label={t('viewSkillRadar')} onPress={p.onSkillRadar} style={styles.action} />
          {p.onWordInWild && (
            <ProtoButton variant="outline" icon="search-outline" label={t('findWordInWild')} onPress={p.onWordInWild} style={styles.action} />
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  header: { position: 'absolute', left: 0, right: 0, top: 0 },
  bubbleTitle: { color: '#12203F', fontSize: 15, fontWeight: '800' },
  bubbleSub: { color: '#2A3B5E', fontSize: 13, marginTop: 2 },
  body: { paddingHorizontal: 16, gap: 14, marginTop: -16 },
  bodyWide: { maxWidth: 1180, width: '100%', alignSelf: 'center', paddingHorizontal: 32, marginTop: 18 },
  current: { gap: 4, padding: 16 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  stageName: { fontSize: 22, fontWeight: '900' },
  nextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  order: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  stageCard: { borderRadius: 16, overflow: 'hidden', width: '48.6%', flexGrow: 1 },
  stageCardWide: { width: '31.8%', flexGrow: 1 },
  thumb: { borderRadius: 0 },
  lock: { position: 'absolute', top: 0, left: 0, right: 0, height: 84, alignItems: 'center', justifyContent: 'center' },
  stageText: { padding: 12, gap: 3 },
  stageTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stageCardName: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  actions: { gap: 10, flexDirection: 'row', flexWrap: 'wrap' },
  action: { flexGrow: 1, flexBasis: 220 },
});
