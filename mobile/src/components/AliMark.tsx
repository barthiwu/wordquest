import Svg, { G, Path, Line } from 'react-native-svg';

export const QUILL_BODY_D =
  'M60,10 C78,22 90,46 84,74 C80,94 68,112 58,132 C50,112 38,92 36,68 C34,44 44,20 60,10 Z';
export const DROP_D =
  'M8,0 C12,6 15,10 15,14 C15,17.3 11.9,20 8,20 C4.1,20 1,17.3 1,14 C1,10 4,6 8,0 Z';
export const SWIRL_D =
  'M46.0,21.0 L50.7,21.7 L55.2,23.0 L59.5,25.0 L63.3,27.5 L66.7,30.5 L69.6,34.0 L72.0,37.8 L73.8,41.8 L74.9,46.1 L75.4,50.3 L75.3,54.6 L74.6,58.8 L73.2,62.7 L71.4,66.4 L69.1,69.8 L66.3,72.7 L63.2,75.2 L59.8,77.1 L56.2,78.6 L52.4,79.5 L48.6,79.8 L44.9,79.6 L41.3,78.8 L37.9,77.6 L34.7,75.8 L31.9,73.7 L29.4,71.2 L27.4,68.4 L25.8,65.4 L24.7,62.3 L24.0,59.1 L23.9,55.8 L24.2,52.6 L24.9,49.5 L26.1,46.7 L27.7,44.0 L29.6,41.7 L31.7,39.7 L34.2,38.1 L36.7,36.8 L39.4,36.0 L42.2,35.6 L44.9,35.5 L47.5,35.9 L50.1,36.6 L52.4,37.7 L54.5,39.1 L56.4,40.7 L57.9,42.6 L59.2,44.6 L60.1,46.8 L60.6,49.0 L60.9,51.2 L60.8,53.4 L60.4,55.5 L59.7,57.5 L58.7,59.3 L57.5,60.9 L56.2,62.3 L54.6,63.4 L53.0,64.3 L51.3,64.9 L49.6,65.2 L47.8,65.3 L46.2,65.1 L44.6,64.7 L43.2,64.0 L41.9,63.2 L40.8,62.2 L39.9,61.2 L39.2,60.0 L38.7,58.8 L38.4,57.5 L38.3,56.3 L38.4,55.1 L38.6,54.0 L39.0,53.0 L39.6,52.1 L40.2,51.3 L41.0,50.7 L41.7,50.2 L42.6,49.9 L43.4,49.7 L44.1,49.7 L44.9,49.8 L45.5,50.0 L46.1,50.3 L46.6,50.7 L46.9,51.1';

interface AliMarkProps {
  size?: number;
}

/**
 * ALI's mark — the combined quill/ink-drops/swirl symbol approved off
 * the WordQuest V1 project's Glyph & ALI design canvas: a slanted quill
 * (the angle a hand actually holds one at), two ink drops beaded on its
 * spine, and the marginalia swirl trailing from exactly where the nib
 * touches down. This is the "knockout" coloring — a dark silhouette with
 * a light accent on the drops, meant to sit inside a filled arcaneSoft
 * circle (see AliBubble, QuestCompleteScreen, AliScreen) the same way
 * the old Ionicons "sparkles" placeholder did. For a standalone mark on
 * a dark surface (no filled circle behind it), use AliMarkHero instead.
 *
 * The design canvas's honest finding still applies: this is a detailed
 * mark, and at the ~13-16px this renders at inside a small avatar circle
 * it reads as a soft rounded silhouette with a bright fleck, not as
 * "quill + drops + swirl" — legible as ALI's shape, not as its story.
 * That's expected, not a bug; a viewer sees the full mark large on the
 * Glyph & ALI canvas and full-size wherever a hero placement (splash,
 * profile) eventually uses AliMarkHero.
 */
export function AliMark({ size = 16 }: AliMarkProps) {
  const bg = '#12102A';
  const accent = '#C4B5FD';
  return (
    <Svg width={size} height={size * (210 / 120)} viewBox="0 0 120 210" fill="none">
      <G transform="rotate(-28,58,132)">
        <Path d={QUILL_BODY_D} fill={bg} />
        <G transform="translate(51,46) scale(0.9)">
          <Path d={DROP_D} fill={accent} />
        </G>
        <G transform="translate(50,78) scale(0.72)">
          <Path d={DROP_D} fill={accent} />
        </G>
      </G>
      <G transform="translate(16.6,115.1) scale(0.9)">
        <Path d={SWIRL_D} stroke={bg} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

/**
 * The hero coloring of ALI's mark — arcaneSoft body and swirl, dark
 * drops — for standalone use directly on a dark surface (no filled
 * circle behind it): a splash moment, ALI's own profile, merch mockups.
 * Not currently mounted anywhere in the app; added alongside AliMark so
 * the first screen that wants a hero ALI moment can drop it in without
 * re-deriving the geometry.
 */
export function AliMarkHero({ size = 120 }: AliMarkProps) {
  const bg = '#12102A';
  const accent = '#C4B5FD';
  return (
    <Svg width={size} height={size * (210 / 120)} viewBox="0 0 120 210" fill="none">
      <G transform="rotate(-28,58,132)">
        <Path d={QUILL_BODY_D} fill={accent} opacity={0.94} />
        <Line x1={60} y1={20} x2={58} y2={128} stroke={bg} strokeWidth={2} strokeLinecap="round" opacity={0.5} />
        <G transform="translate(51,46) scale(0.9)">
          <Path d={DROP_D} fill={bg} />
        </G>
        <G transform="translate(50,78) scale(0.72)">
          <Path d={DROP_D} fill={bg} />
        </G>
      </G>
      <G transform="translate(16.6,115.1) scale(0.9)">
        <Path
          d={SWIRL_D}
          stroke={accent}
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
}
