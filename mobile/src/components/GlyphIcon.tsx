import Svg, { Circle, Line, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useThemeColors } from '@/state/themeStore';

interface GlyphIconProps {
  size?: number;
  color?: string;
}

/**
 * The Insight Glyph symbol on its own — a circle, an open arc, and a
 * vertical stroke through the gap (the "power/standby" reading: Glyphs
 * are insight, switched on). Original vector, drawn from scratch to match
 * the proportions of the brand reference exactly — see the WordQuest V1
 * project's Glyph & ALI design canvas for the full proposal this was
 * approved from. `color` defaults to the current theme's currency accent
 * (glyph); pass an explicit color to use it as a plain line mark against
 * a different background.
 */
export function GlyphIcon({ size = 24, color }: GlyphIconProps) {
  const themeColors = useThemeColors();
  const resolvedColor = color ?? themeColors.glyph;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Circle cx={50} cy={50} r={45} fill="none" stroke={resolvedColor} strokeWidth={7} />
      <Path
        d="M69.09,29.91 A27,27 0 1,1 30.91,29.91"
        fill="none"
        stroke={resolvedColor}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <Line
        x1={50}
        y1={26}
        x2={50}
        y2={76}
        stroke={resolvedColor}
        strokeWidth={8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

interface GlyphCoinProps {
  /** Overall coin diameter. Defaults to 28. */
  size?: number;
}

/**
 * The Glyph currency as a minted coin: a gold disc with a rim and a
 * bevel ring for depth, and the Insight Glyph "power" symbol (a ring
 * with a gap at the top plus a vertical stroke through the opening)
 * engraved in the center.
 *
 * Rebuilt from scratch (2026-09) after earlier passes at this exact
 * design churned without landing -- the recurring problems were a gap
 * cut into a *separate* small arc stacked on top of a complete outer
 * circle (double-circle clutter) and eyeballed gap angles that drifted
 * off-center. This version cuts the gap directly into the one ring
 * (no stacked shapes) and the gap's endpoints were solved with exact
 * SVG elliptical-arc endpoint-to-center math, then verified by
 * sampling the real arc (not an approximate preview) before shipping,
 * so the opening is precisely centered on the coin's vertical axis and
 * the vertical stroke lands in the middle of it -- confirmed legible
 * down to the 16px render size used on the Level Roadmap.
 *
 * Coordinates are in a fixed 0-100 space (the whole coin scales via
 * `size`), so this stays correct at every call site without
 * per-size math.
 */
export function GlyphCoin({ size = 28 }: GlyphCoinProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="glyphCoinFace" cx="38%" cy="32%" r="78%">
          <Stop offset="0%" stopColor="#FFE9A8" />
          <Stop offset="35%" stopColor="#F4C542" />
          <Stop offset="80%" stopColor="#D89F1F" />
          <Stop offset="100%" stopColor="#B77E14" />
        </RadialGradient>
      </Defs>
      {/* Coin face */}
      <Circle cx={50} cy={50} r={48} fill="url(#glyphCoinFace)" />
      {/* Rim, for depth */}
      <Circle cx={50} cy={50} r={44} fill="none" stroke="#C98A1D" strokeWidth={4} />
      {/* Bevel: a subtle inset ring between the rim and the symbol */}
      <Circle
        cx={50}
        cy={50}
        r={38}
        fill="none"
        stroke="#8B5E0F"
        strokeWidth={2}
        strokeOpacity={0.45}
      />
      {/* Engraved symbol: the original Insight Glyph mark (see the
          plain GlyphIcon export above, unchanged since the project's
          first design pass) -- a complete outer ring, an inner ring
          with a 90deg gap at the top (+/-45deg either side of
          top-dead-center), and a vertical stroke through the gap. The
          complete outer ring is what keeps this reading as a glyph/
          emblem rather than a plain on/off icon. Proportions carried
          over from GlyphIcon's r=45/r=27/y26-76 (in its own 100-unit
          box) scaled by 0.74 to fit the coin's engraving area inside
          the bevel; the inner ring's gap endpoints were solved with
          exact SVG elliptical-arc math and swept the long way around
          (large-arc-flag=1, sweep-flag=0) so it passes through the
          bottom rather than cutting across the gap. */}
      <Circle
        cx={50}
        cy={50}
        r={33.3}
        fill="none"
        stroke="#181233"
        strokeOpacity={0.82}
        strokeWidth={5}
      />
      <Path
        d="M35.86,35.86 A20,20 0 1,0 64.14,35.86"
        fill="none"
        stroke="#181233"
        strokeOpacity={0.82}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <Line
        x1={50}
        y1={32.24}
        x2={50}
        y2={69.24}
        stroke="#181233"
        strokeOpacity={0.82}
        strokeWidth={6}
        strokeLinecap="round"
      />
    </Svg>
  );
}
