import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/constants/theme';
import { journeyVisualFor } from '@/constants/journeyVisuals';

interface StarBarStage {
  key: string;
  unlocked: boolean;
  current: boolean;
}

interface Props {
  stages: StarBarStage[];
}

/**
 * The Journey Star Bar (V1 Completion spec, Sprint 3) — one row spanning
 * every stage the player will ever reach, a filled star per unlocked
 * stage and an outline star for what's still ahead, so the whole arc of
 * the game is visible in one glance rather than only the next single
 * step. The current stage's star gets the ring — everything else is
 * binary (reached / not yet), matching what the server actually tells
 * us (JourneyStageView.unlocked), no invented in-between progress.
 */
export function JourneyStarBar({ stages }: Props) {
  return (
    <View style={styles.row}>
      {stages.map((stage, i) => {
        const visual = journeyVisualFor(stage.key);
        return (
          <View key={stage.key} style={styles.stageWrap}>
            {i > 0 && (
              <View
                style={[
                  styles.connector,
                  { backgroundColor: stage.unlocked ? visual.color : colors.border },
                ]}
              />
            )}
            <View style={[styles.starWrap, stage.current && styles.starWrapCurrent]}>
              <Ionicons
                name={stage.unlocked ? 'star' : 'star-outline'}
                size={stage.current ? 22 : 16}
                color={stage.unlocked ? visual.color : colors.inkMuted}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  stageWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  connector: { flex: 1, height: 2 },
  starWrap: { padding: 2 },
  starWrapCurrent: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.arcaneSoft,
  },
});
