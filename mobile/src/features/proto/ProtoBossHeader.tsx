import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useIsPrototype } from '@/state/uiVersionStore';
import { useThemeColors } from '@/state/themeStore';
import type { AliExpression, AliPose } from '@/services/aliExpression';
import { AliScene } from './ui/AliScene';
import { ArcadeArt } from './ui/ProtoArt';
import { ProgressBar } from './ui/ProtoUI';

/**
 * Prototype "New look" Boss Battle chrome. `hub` is the pre-battle
 * (countdown / join) header: ALI on the inferno scene facing the boss.
 * `battle` is the in-fight strip with a boss-health bar driven by the
 * real questionsAnswered / maxQuestions already on the challenge.
 * Both render nothing in the standard look.
 */
export function ProtoBossHeader({
  mode,
  answered = 0,
  total = 0,
  live = false,
  expression,
  pose,
}: {
  mode: 'hub' | 'battle';
  answered?: number;
  total?: number;
  live?: boolean;
  expression?: AliExpression;
  pose?: AliPose;
}) {
  const proto = useIsPrototype();
  const { t } = useTranslation('proto');
  const colors = useThemeColors();
  if (!proto) return null;

  if (mode === 'hub') {
    return (
      <AliScene
        variant="inferno"
        height={240}
        aliSize={128}
        bubbleTop={22}
        expression={expression ?? (live ? 'FOCUSED' : 'CURIOUS')}
        pose={pose ?? (live ? 'FOCUSED_STANCE' : 'PERCHED')}
        message={live ? t('bossHubLive') : t('bossHubWait')}
        style={styles.scene}
      >
        <View style={styles.boss} pointerEvents="none">
          <ArcadeArt kind="boss" width={104} height={92} style={styles.bossArt} />
        </View>
      </AliScene>
    );
  }

  return (
    <View style={styles.battle}>
      <AliScene
        variant="inferno"
        height={120}
        aliSize={72}
        bubbleTop={20}
        expression={expression ?? 'FOCUSED'}
        pose={pose ?? 'FOCUSED_STANCE'}
        message={<Text style={styles.line}>{t('bossBattleLine')}</Text>}
        style={styles.scene}
      >
        <View style={styles.boss} pointerEvents="none">
          <ArcadeArt kind="boss" width={64} height={56} style={styles.bossArt} />
        </View>
      </AliScene>
      {total > 0 ? (
        <View style={styles.hpRow}>
          <Text style={[styles.hpLabel, { color: colors.danger }]}>{t('bossHealth')}</Text>
          <ProgressBar value={Math.max(0, 1 - answered / total)} color={colors.danger} height={10} style={{ flex: 1 }} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { borderRadius: 18, overflow: 'hidden', alignSelf: 'stretch' },
  boss: { position: 'absolute', right: 10, bottom: 10 },
  bossArt: { borderRadius: 14 },
  battle: { alignSelf: 'stretch', gap: 8 },
  line: { color: '#12203F', fontSize: 13, lineHeight: 17, fontWeight: '700' },
  hpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hpLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
});
