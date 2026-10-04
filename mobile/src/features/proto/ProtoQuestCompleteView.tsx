import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/state/themeStore';
import { FadeInUp } from '@/components/FadeInUp';
import { GlyphCoin } from '@/components/GlyphIcon';
import { RichAliText } from '@/components/RichAliText';
import type { AliDisplayMessage } from '@/services/aliExpression';
import { AliScene } from './ui/AliScene';
import { GlassCard, Panel, Pill, ProtoButton } from './ui/ProtoUI';
import { TrophyArt } from './ui/ProtoArt';

export interface ProtoQuestCompleteProps {
  xpAwarded: number;
  glyphAwarded: number;
  correctCount: number;
  totalCount: number;
  aliMessage?: AliDisplayMessage | null;
  calibrationJustCompleted?: boolean;
  onCalibration: () => void;
  onDone: () => void;
  /** Live ALI reaction popup, owned by the host screen's queue. */
  popup?: ReactNode;
}

/**
 * Prototype "New look" quest-completion result: ALI celebrating centre
 * stage over the castle scene, reward tiles, ALI's send-off, one CTA.
 * Every number is the server's QuestSummary — presentation only.
 */
export function ProtoQuestCompleteView(p: ProtoQuestCompleteProps) {
  const { t } = useTranslation('questComplete');
  const { t: tp } = useTranslation('proto');
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {p.popup}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <AliScene
          variant="castle"
          height={300 + insets.top}
          placement="center"
          aliSize={150}
          expression="TRIUMPHANT"
          pose="WING_SPREAD_FULL"
          intensity={1}
          fadeTo={colors.background}
          message={tp('questDoneBubble')}
        >
          <View style={styles.trophy} pointerEvents="none">
            <TrophyArt size={64} />
          </View>
        </AliScene>

        <View style={styles.body}>
          <FadeInUp style={styles.center}>
            <Text style={[styles.title, { color: colors.ink }]}>{t('title')}</Text>
            <Pill color={colors.success}>{t('correctSummary', { correct: p.correctCount, total: p.totalCount })}</Pill>
          </FadeInUp>

          <FadeInUp delay={150} style={styles.tiles}>
            <GlassCard style={styles.tile}>
              <Ionicons name="star" size={30} color="#FFC933" />
              <Text style={[styles.tileValue, { color: colors.ink }]}>+{p.xpAwarded}</Text>
              <Text style={[styles.tileLabel, { color: colors.inkMuted }]}>{t('xpEarned')}</Text>
            </GlassCard>
            <GlassCard style={styles.tile}>
              <GlyphCoin size={30} />
              <Text style={[styles.tileValue, { color: colors.glyph }]}>+{p.glyphAwarded}</Text>
              <Text style={[styles.tileLabel, { color: colors.inkMuted }]}>{t('glyphsEarned')}</Text>
            </GlassCard>
          </FadeInUp>

          {p.aliMessage ? (
            <FadeInUp delay={300}>
              <Panel style={styles.aliCard}>
                <Text style={[styles.aliName, { color: colors.arcaneSoft }]}>{t('aliName')}</Text>
                <RichAliText style={{ color: colors.ink, fontSize: 15, lineHeight: 21 }} text={p.aliMessage.text} />
                {p.aliMessage.recommendation ? (
                  <RichAliText style={{ color: colors.arcaneSoft, fontSize: 13, fontWeight: '700' }} text={p.aliMessage.recommendation} />
                ) : null}
              </Panel>
            </FadeInUp>
          ) : null}

          {p.calibrationJustCompleted ? (
            <FadeInUp delay={450}>
              <Pressable
                onPress={p.onCalibration}
                accessibilityRole="button"
                accessibilityLabel={t('calibrationReadyAccessibilityLabel')}
                accessibilityHint={t('calibrationReadyAccessibilityHint')}
              >
                <Panel style={[styles.aliCard, { borderColor: colors.arcane }]}>
                  <Text style={[styles.aliName, { color: colors.arcaneSoft }]}>{t('calibrationReadyTitle')}</Text>
                  <Text style={{ color: colors.inkMuted, fontSize: 14 }}>{t('calibrationReadyBody')}</Text>
                </Panel>
              </Pressable>
            </FadeInUp>
          ) : null}

          <ProtoButton label={t('seeProgress')} accessibilityLabel={t('seeProgressAccessibilityLabel')} trailingIcon="arrow-forward" onPress={p.onDone} />
          <Text style={[styles.hint, { color: colors.inkMuted }]}>{tp('questDoneHint')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1 },
  trophy: { position: 'absolute', right: 20, bottom: 24 },
  body: { paddingHorizontal: 20, gap: 16, width: '100%', maxWidth: 640, alignSelf: 'center', marginTop: -8 },
  center: { alignItems: 'center', gap: 8 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: 0.3 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 18 },
  tileValue: { fontSize: 30, fontWeight: '900' },
  tileLabel: { fontSize: 13, fontWeight: '700' },
  aliCard: { gap: 6 },
  aliName: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  hint: { textAlign: 'center', fontSize: 12 },
});
