import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import {
  BEAK_D,
  BELLY,
  BODY,
  EYE_PUPIL,
  EYE_WHITE,
  HEAD,
  MAGPIE_ASPECT,
  MAGPIE_VIEW_BOX,
  MONOCLE_RING,
  TAIL_D,
  WING_D,
} from './aliMagpieShapes';

interface AliMarkProps {
  size?: number;
}

/**
 * ALI's mark — the Eurasian magpie approved off the ALI Magpie Concepts
 * design canvas ("The Mystic Scholar"), replacing the original quill/ink
 * mark. This is the "knockout" coloring — a dark silhouette with the
 * signature gold beak as its one bright fleck — meant to sit inside a
 * filled arcaneSoft circle (see AliBubble, QuestCompleteScreen, AliScreen)
 * the same way the mark has always been mounted.
 *
 * At the ~11-20px this renders at inside a small avatar circle it reads
 * as a soft rounded bird silhouette with a warm gold point, not as "tail,
 * wing, head, beak" — legible as ALI's shape, not its story. The monocle,
 * tucked quill and glowing rune only show up at AliMarkAnimated's larger
 * "ALI moment" size; they're the story, this is just the shape.
 */
export function AliMark({ size = 16 }: AliMarkProps) {
  const bg = '#12102A';
  const belly = '#C4B5FD';
  const gold = '#D9A94B';
  return (
    <Svg width={size} height={size * MAGPIE_ASPECT} viewBox={MAGPIE_VIEW_BOX} fill="none">
      <Path d={TAIL_D} fill={bg} />
      <Ellipse cx={BODY.cx} cy={BODY.cy} rx={BODY.rx} ry={BODY.ry} fill={bg} />
      <Ellipse cx={BELLY.cx} cy={BELLY.cy} rx={BELLY.rx} ry={BELLY.ry} fill={belly} />
      <Path d={WING_D} fill={bg} />
      <Circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={bg} />
      <Path d={BEAK_D} fill={gold} />
    </Svg>
  );
}

/**
 * The hero coloring of ALI's mark — accent-filled bird with dark ink
 * detail, gold beak — for standalone use directly on a dark surface (no
 * filled circle behind it): StagePathRail, JourneyMapExcerpt, merch
 * mockups. Adds the eye and monocle ring, which read fine as small solid
 * shapes at the sizes this actually mounts at (20-40px) without the
 * fragility of the animated version's fine linework.
 */
export function AliMarkHero({ size = 120 }: AliMarkProps) {
  const bg = '#12102A';
  const accent = '#C4B5FD';
  const gold = '#D9A94B';
  return (
    <Svg width={size} height={size * MAGPIE_ASPECT} viewBox={MAGPIE_VIEW_BOX} fill="none">
      <Path d={TAIL_D} fill={accent} />
      <Ellipse cx={BODY.cx} cy={BODY.cy} rx={BODY.rx} ry={BODY.ry} fill={accent} />
      <Ellipse cx={BELLY.cx} cy={BELLY.cy} rx={BELLY.rx} ry={BELLY.ry} fill={bg} opacity={0.85} />
      <Path d={WING_D} fill={accent} opacity={0.92} />
      <Circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={accent} />
      <Circle cx={EYE_WHITE.cx} cy={EYE_WHITE.cy} r={EYE_WHITE.r} fill={bg} opacity={0.85} />
      <Circle cx={EYE_PUPIL.cx} cy={EYE_PUPIL.cy} r={EYE_PUPIL.r * 0.7} fill={bg} />
      <Circle
        cx={MONOCLE_RING.cx}
        cy={MONOCLE_RING.cy}
        r={MONOCLE_RING.r}
        fill="none"
        stroke={gold}
        strokeWidth={2.5}
      />
      <Path d={BEAK_D} fill={gold} />
    </Svg>
  );
}
