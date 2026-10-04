import { AliCharacter } from './AliCharacter';

interface AliMarkProps {
  size?: number;
}

/**
 * ALI's mark — a still, head-and-shoulders crop of the scholar magpie for
 * small avatars and inline labels (11-20px). Same single drawing as
 * AliCharacter (no separate icon artwork), held perfectly still.
 */
export function AliMark({ size = 16 }: AliMarkProps) {
  return <AliCharacter size={size} framing="bust" animated={false} />;
}

/**
 * ALI's mark for standalone use on a dark surface (StagePathRail,
 * JourneyMapExcerpt): the whole bird once there's room for him, the
 * head-and-shoulders crop when it's a small marker.
 */
export function AliMarkHero({ size = 120 }: AliMarkProps) {
  return <AliCharacter size={size} framing={size < 32 ? 'bust' : 'full'} animated={false} />;
}
