import { useMemo } from 'react';
import Svg, { Circle, Rect } from 'react-native-svg';

const COLORS = ['#F4C542', '#C4B5FD', '#8B5CF6', '#43D9A3', '#FF8FB1', '#7DD3FC', '#FFF6D0'];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Deterministic confetti (identical on every render, so a captured card never differs from the screen). */
export function Confetti({
  width,
  height,
  count = 40,
  seed = 7,
  top = 0,
  bottom,
  opacity = 1,
}: {
  width: number;
  height: number;
  count?: number;
  seed?: number;
  /** Pieces only fall between top and bottom (px). */
  top?: number;
  bottom?: number;
  opacity?: number;
}) {
  const pieces = useMemo(() => {
    const g = rng(seed);
    const to = bottom ?? height;
    return Array.from({ length: count }, () => ({
      x: g() * width,
      y: top + g() * (to - top),
      w: 4 + g() * 6,
      h: 7 + g() * 7,
      r: g() * 360,
      c: COLORS[Math.floor(g() * COLORS.length)],
      dot: g() < 0.28,
      o: 0.55 + g() * 0.45,
    }));
  }, [width, height, count, seed, top, bottom]);
  return (
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0 }}
      pointerEvents="none"
      opacity={opacity}
    >
      {pieces.map((p, i) =>
        p.dot ? (
          <Circle key={i} cx={p.x} cy={p.y} r={p.w / 2} fill={p.c} opacity={p.o} />
        ) : (
          <Rect
            key={i}
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            rx={1.5}
            fill={p.c}
            opacity={p.o}
            transform={`rotate(${p.r} ${p.x + p.w / 2} ${p.y + p.h / 2})`}
          />
        ),
      )}
    </Svg>
  );
}
