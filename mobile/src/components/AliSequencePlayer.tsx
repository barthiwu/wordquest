import { useEffect, useMemo, useState } from 'react';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { AliCharacter, type AliFraming } from './AliCharacter';
import { ALI_SEQUENCES, type AliSequenceId } from './aliSequences';

export interface AliSequencePlayerProps {
  sequence: AliSequenceId;
  size?: number;
  framing?: AliFraming;
  /** Called once when the last beat has finished its hold. */
  onDone?: () => void;
}

/**
 * Plays one of the Bible §7 major sequences on the single rig: steps through
 * the beats on a timer, holding the last. Under reduced motion (or when the
 * OS has no animation) it shows the sequence's one still beat instead.
 */
export function AliSequencePlayer({
  sequence,
  size = 96,
  framing = 'full',
  onDone,
}: AliSequencePlayerProps) {
  const reduceMotion = useReduceMotion();
  const def = ALI_SEQUENCES[sequence];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (reduceMotion) return undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    def.steps.forEach((step, i) => {
      timers.push(setTimeout(() => setIndex(i), elapsed));
      elapsed += step.holdMs;
    });
    timers.push(setTimeout(() => onDone?.(), elapsed));
    return () => timers.forEach(clearTimeout);
    // onDone intentionally excluded: a new callback identity must not restart the sequence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence, reduceMotion]);

  const step = useMemo(
    () =>
      reduceMotion ? def.steps[def.stillStep] : def.steps[Math.min(index, def.steps.length - 1)],
    [def, index, reduceMotion],
  );
  return (
    <AliCharacter
      size={size}
      framing={framing}
      expression={step.expression}
      pose={step.pose}
      intensity={step.intensity}
      animated={!reduceMotion}
    />
  );
}
