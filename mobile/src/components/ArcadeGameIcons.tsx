import { StyleSheet, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import type { ThemeColors } from '@/constants/theme';

export interface ArcadeGameIconProps {
  colors: ThemeColors;
  /** Outer badge diameter. The glyph inside scales proportionally.
   * Default matches PlayScreen's GameRow icon slot. */
  size?: number;
}

const DEFAULT_BADGE_SIZE = 44;
const GLYPH_RATIO = 26 / 44;

/**
 * Circular badge shared by all three arcade-game marks below — same
 * "surfaceRaised fill, border-token outline" language as other small
 * icon badges in the app. Design canvas review, Sept 2026 ("WordQuest
 * Arcade Game Logos" artifact): Barth picked one option per game
 * (ScrambleQuest A, Word Duel B, Complete It A) to "implement it where
 * it should be" — that's PlayScreen's GameRow, wired in below.
 */
function IconBadge({
  colors,
  size = DEFAULT_BADGE_SIZE,
  children,
}: {
  colors: ThemeColors;
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.border,
        },
      ]}
    >
      {children}
    </View>
  );
}

/** ScrambleQuest — Option A: three scattered, overlapping letter tiles. */
export function ScrambleQuestIcon({ colors, size = DEFAULT_BADGE_SIZE }: ArcadeGameIconProps) {
  const glyph = size * GLYPH_RATIO;
  return (
    <IconBadge colors={colors} size={size}>
      <Svg width={glyph} height={glyph} viewBox="0 0 100 100">
        <Rect
          x={22}
          y={40}
          width={24}
          height={24}
          rx={5}
          fill="none"
          stroke={colors.arcaneSoft}
          strokeWidth={3.5}
          transform="rotate(-12 34 52)"
        />
        <Rect
          x={38}
          y={34}
          width={28}
          height={28}
          rx={6}
          fill={colors.glyph}
          transform="rotate(8 52 48)"
        />
        <Rect
          x={56}
          y={42}
          width={24}
          height={24}
          rx={5}
          fill="none"
          stroke={colors.glyph}
          strokeWidth={3.5}
          transform="rotate(-6 68 54)"
        />
      </Svg>
    </IconBadge>
  );
}

/** Word Duel — Option B: two crossed quills. */
export function WordDuelIcon({ colors, size = DEFAULT_BADGE_SIZE }: ArcadeGameIconProps) {
  const glyph = size * GLYPH_RATIO;
  return (
    <IconBadge colors={colors} size={size}>
      <Svg width={glyph} height={glyph} viewBox="0 0 100 100">
        <Line
          x1={26}
          y1={26}
          x2={74}
          y2={74}
          stroke={colors.glyph}
          strokeWidth={7}
          strokeLinecap="round"
        />
        <Path d="M74,74 L84,78 L78,84 Z" fill={colors.glyph} />
        <Line
          x1={74}
          y1={26}
          x2={26}
          y2={74}
          stroke={colors.arcaneSoft}
          strokeWidth={7}
          strokeLinecap="round"
        />
        <Path d="M26,74 L16,78 L22,84 Z" fill={colors.arcaneSoft} />
      </Svg>
    </IconBadge>
  );
}

/** Complete It — Option A: a dashed-outline gap tile with a checkmark,
 * flanked by two solid tiles. */
export function CompleteItIcon({ colors, size = DEFAULT_BADGE_SIZE }: ArcadeGameIconProps) {
  const glyph = size * GLYPH_RATIO;
  return (
    <IconBadge colors={colors} size={size}>
      <Svg width={glyph} height={glyph} viewBox="0 0 100 100">
        <Rect
          x={14}
          y={40}
          width={22}
          height={26}
          rx={5}
          fill={colors.surface}
          stroke={colors.arcaneSoft}
          strokeWidth={3}
        />
        <Rect
          x={39}
          y={40}
          width={22}
          height={26}
          rx={5}
          fill="none"
          stroke={colors.glyph}
          strokeWidth={3}
          strokeDasharray="4 3"
        />
        <Path
          d="M45 53 L49 58 L57 46"
          fill="none"
          stroke={colors.glyph}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Rect
          x={64}
          y={40}
          width={22}
          height={26}
          rx={5}
          fill={colors.surface}
          stroke={colors.arcaneSoft}
          strokeWidth={3}
        />
      </Svg>
    </IconBadge>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
