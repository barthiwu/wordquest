import { useMemo } from 'react';
import Svg, { Circle, Line } from 'react-native-svg';
import type { ThemeColors } from '@/constants/theme';

export type HangmanFigureStatus = 'playing' | 'won' | 'lost';

export interface HangmanFigureProps {
  colors: ThemeColors;
  /** Wrong guesses so far, 0..6: head, body, left arm, right arm, left leg, right leg. */
  wrongCount: number;
  status?: HangmanFigureStatus;
  size?: number;
}

/** The body parts in the order wrong guesses add them. */
const PARTS = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;

/**
 * The gallows and the man. The gallows is always drawn; each wrong letter
 * adds one body part, and the sixth completes the figure (lost). When the
 * word is found the man is saved: the rope is gone, he stands beside the
 * gallows in the success colour with a smile.
 */
export function HangmanFigure({
  colors,
  wrongCount,
  status = 'playing',
  size = 200,
}: HangmanFigureProps) {
  const visible = useMemo(
    () => new Set(PARTS.slice(0, Math.max(0, Math.min(6, wrongCount)))),
    [wrongCount],
  );
  const saved = status === 'won';
  const lost = status === 'lost';

  const wood = colors.inkMuted;
  const man = saved ? colors.success : lost ? colors.danger : colors.ink;
  const sw = 4;
  // The man hangs from the rope at x=150; when saved he steps down beside the gallows.
  const cx = saved ? 168 : 150;
  const headY = saved ? 70 : 62;
  const dy = saved ? 8 : 0;

  const show = (part: (typeof PARTS)[number]) => saved || visible.has(part);

  return (
    <Svg
      width={size}
      height={size * 1.15}
      viewBox="0 0 200 230"
      accessibilityRole="image"
      accessibilityLabel={`${Math.min(6, wrongCount)}/6`}
    >
      {/* gallows */}
      <Line
        x1={20}
        y1={216}
        x2={110}
        y2={216}
        stroke={wood}
        strokeWidth={sw + 2}
        strokeLinecap="round"
      />
      <Line
        x1={50}
        y1={216}
        x2={50}
        y2={16}
        stroke={wood}
        strokeWidth={sw + 2}
        strokeLinecap="round"
      />
      <Line
        x1={47}
        y1={16}
        x2={150}
        y2={16}
        stroke={wood}
        strokeWidth={sw + 2}
        strokeLinecap="round"
      />
      <Line x1={50} y1={52} x2={86} y2={16} stroke={wood} strokeWidth={sw} strokeLinecap="round" />
      {!saved && <Line x1={150} y1={16} x2={150} y2={headY - 16} stroke={wood} strokeWidth={3} />}

      {/* the man */}
      {show('head') && (
        <Circle cx={cx} cy={headY} r={16} stroke={man} strokeWidth={sw} fill="none" />
      )}
      {show('head') && lost && (
        <>
          <Line
            x1={cx - 8}
            y1={headY - 6}
            x2={cx - 3}
            y2={headY - 1}
            stroke={man}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <Line
            x1={cx - 3}
            y1={headY - 6}
            x2={cx - 8}
            y2={headY - 1}
            stroke={man}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <Line
            x1={cx + 3}
            y1={headY - 6}
            x2={cx + 8}
            y2={headY - 1}
            stroke={man}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <Line
            x1={cx + 8}
            y1={headY - 6}
            x2={cx + 3}
            y2={headY - 1}
            stroke={man}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </>
      )}
      {saved && (
        <>
          <Circle cx={cx - 6} cy={headY - 3} r={1.8} fill={man} />
          <Circle cx={cx + 6} cy={headY - 3} r={1.8} fill={man} />
          <Line
            x1={cx - 7}
            y1={headY + 5}
            x2={cx - 3}
            y2={headY + 9}
            stroke={man}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <Line
            x1={cx - 3}
            y1={headY + 9}
            x2={cx + 3}
            y2={headY + 9}
            stroke={man}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <Line
            x1={cx + 3}
            y1={headY + 9}
            x2={cx + 7}
            y2={headY + 5}
            stroke={man}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </>
      )}
      {show('body') && (
        <Line
          x1={cx}
          y1={headY + 16}
          x2={cx}
          y2={headY + 76 + dy}
          stroke={man}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {show('leftArm') && (
        <Line
          x1={cx}
          y1={headY + 34}
          x2={cx - 24}
          y2={headY + (saved ? 24 : 56)}
          stroke={man}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {show('rightArm') && (
        <Line
          x1={cx}
          y1={headY + 34}
          x2={cx + 24}
          y2={headY + (saved ? 24 : 56)}
          stroke={man}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {show('leftLeg') && (
        <Line
          x1={cx}
          y1={headY + 76 + dy}
          x2={cx - 22}
          y2={headY + 116 + dy}
          stroke={man}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {show('rightLeg') && (
        <Line
          x1={cx}
          y1={headY + 76 + dy}
          x2={cx + 22}
          y2={headY + 116 + dy}
          stroke={man}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}
