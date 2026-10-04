import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useIsPrototype } from '@/state/uiVersionStore';
import type { AliExpression, AliPose } from '@/services/aliExpression';
import { AliScene } from './ui/AliScene';
import { StageStepper } from './ui/ProtoUI';
import { useThemeColors } from '@/state/themeStore';

export type QuestMood = 'ask' | 'good' | 'miss' | 'wild';

const MOODS: Record<QuestMood, { expression: AliExpression; pose: AliPose }> = {
  ask: { expression: 'CURIOUS', pose: 'HEAD_TILT' },
  good: { expression: 'PROUD', pose: 'CELEBRATORY_HOP' },
  miss: { expression: 'ENCOURAGING', pose: 'APPROVING_NOD' },
  wild: { expression: 'MISCHIEVOUS', pose: 'PERCHED' },
};

/**
 * Prototype "New look" header for the Daily Quest flow: ALI in a scene
 * reacting to the stage, plus the Guess → Sentence → Paragraph stepper.
 * Renders nothing in the standard look, so it can sit unconditionally at
 * the top of every stage.
 *
 * step: 0 guess, 1 sentence, 2 paragraph, 3 everything done (wild bonus).
 */
export function ProtoQuestHeader({ step, mood, line }: { step: number; mood: QuestMood; line?: string }) {
  const proto = useIsPrototype();
  const { t } = useTranslation('proto');
  const colors = useThemeColors();
  if (!proto) return null;
  const m = MOODS[mood];
  const defaultLine = {
    ask: [t('aliGuess'), t('aliSentence'), t('aliParagraph'), t('aliWild')][Math.min(step, 3)],
    good: t('aliGood'),
    miss: t('aliMiss'),
    wild: t('aliWild'),
  }[mood];
  return (
    <View style={styles.wrap}>
      <AliScene
        variant="forest"
        height={170}
        aliSize={104}
        expression={m.expression}
        pose={m.pose}
        intensity={mood === 'good' ? 1 : 0}
        message={<Text style={styles.line}>{line ?? defaultLine}</Text>}
        style={styles.scene}
      />
      <StageStepper labels={[t('stepGuess'), t('stepSentence'), t('stepParagraph')]} current={step} />
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: 6 },
  scene: { borderRadius: 20, overflow: 'hidden' },
  line: { color: '#12203F', fontSize: 14, lineHeight: 19, fontWeight: '700' },
  rule: { height: 1, opacity: 0.4 },
});
