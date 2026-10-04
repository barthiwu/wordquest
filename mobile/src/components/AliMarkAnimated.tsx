import { AliCharacter } from './AliCharacter';

interface AliMarkAnimatedProps {
  size?: number;
}

/**
 * ALI as a deliberate "ALI moment" (Quest Complete's send-off, the ALI
 * screen hero): the full scholar magpie with his idle life — breathing,
 * blinking, tail sway, the drifting rune. Reactions with a specific
 * expression/pose go through AliCharacter / AliReactionPopup directly.
 */
export function AliMarkAnimated({ size = 72 }: AliMarkAnimatedProps) {
  return <AliCharacter size={size} expression="PLEASED" pose="PERCHED" intensity={1} />;
}
