import { StyleSheet, Text } from 'react-native';
import { useIsPrototype } from '@/state/uiVersionStore';
import type { AliExpression, AliPose } from '@/services/aliExpression';
import { AliScene } from './ui/AliScene';

/**
 * Prototype "New look" strip for in-game arcade screens (ScrambleQuest,
 * Complete It, Word Duel): ALI over the arena with a one-line prompt.
 * Renders nothing in the standard look, so it sits unconditionally above
 * each game's own content.
 */
export function ProtoGameHeader({
  line,
  expression = 'FOCUSED',
  pose = 'FOCUSED_STANCE',
}: {
  line?: string;
  expression?: AliExpression;
  pose?: AliPose;
}) {
  const proto = useIsPrototype();
  if (!proto) return null;
  return (
    <AliScene
      variant="arena"
      height={146}
      aliSize={84}
      bubbleTop={26}
      expression={expression}
      pose={pose}
      message={line ? <Text style={styles.line}>{line}</Text> : undefined}
      style={styles.scene}
    />
  );
}

const styles = StyleSheet.create({
  scene: { borderRadius: 18, overflow: 'hidden', alignSelf: 'stretch' },
  line: { color: '#12203F', fontSize: 13, lineHeight: 17, fontWeight: '700' },
});
